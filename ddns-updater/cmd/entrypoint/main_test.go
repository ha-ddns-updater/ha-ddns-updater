package main

import (
	"bytes"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseLogLevel(t *testing.T) {
	t.Parallel()

	testCases := map[string]struct {
		value interface{}
		level logLevel
	}{
		"nil":               {value: nil, level: logLevelInfo},
		"empty":             {value: "", level: logLevelInfo},
		"debug exact":       {value: "debug", level: logLevelDebug},
		"debug mixed case":  {value: "DeBuG", level: logLevelDebug},
		"debug trimmed":     {value: " debug ", level: logLevelDebug},
		"warn":              {value: "warn", level: logLevelWarn},
		"warning":           {value: "warning", level: logLevelWarn},
		"error":             {value: "error", level: logLevelError},
		"fatal":             {value: "fatal", level: logLevelFatal},
		"number":            {value: 123, level: logLevelInfo},
		"boolean":           {value: true, level: logLevelInfo},
		"stringer friendly": {value: []byte("debug"), level: logLevelInfo},
	}

	for name, testCase := range testCases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			level := parseLogLevel(testCase.value)
			if level != testCase.level {
				t.Fatalf("expected level=%s, got %s", testCase.level, level)
			}
		})
	}
}

func TestFormatDirEntries(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(tempDir, "subdir"), 0o755); err != nil {
		t.Fatalf("creating directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "alpha.txt"), []byte("a"), 0o600); err != nil {
		t.Fatalf("creating alpha.txt: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "zeta.txt"), []byte("z"), 0o600); err != nil {
		t.Fatalf("creating zeta.txt: %v", err)
	}

	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("reading temp dir: %v", err)
	}

	got := formatDirEntries(entries)
	want := []string{"alpha.txt", "subdir/", "zeta.txt"}
	if len(got) != len(want) {
		t.Fatalf("expected %d entries, got %d: %v", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected entry %d to be %q, got %q", i, want[i], got[i])
		}
	}
}

func TestLogOptionsDiagnostics(t *testing.T) {
	tempDir := t.TempDir()
	optionsFilepath := filepath.Join(tempDir, "options.json")
	addonConfigDir := filepath.Join(tempDir, "config")
	optionsData := []byte("{\n  \"environments\": {\"LOG_LEVEL\": \"debug\"}\n}\n")
	if err := os.WriteFile(optionsFilepath, optionsData, 0o600); err != nil {
		t.Fatalf("writing options file: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tempDir, "providers"), 0o755); err != nil {
		t.Fatalf("creating providers dir: %v", err)
	}
	if err := os.Mkdir(addonConfigDir, 0o755); err != nil {
		t.Fatalf("creating addon config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(addonConfigDir, "updates.json"), []byte("{}"), 0o600); err != nil {
		t.Fatalf("writing updates.json: %v", err)
	}

	buffer := bytes.NewBuffer(nil)
	previousWriter := log.Writer()
	previousFlags := log.Flags()
	previousLevel := activeLogLevel
	log.SetOutput(buffer)
	log.SetFlags(0)
	activeLogLevel = logLevelDebug
	defer log.SetOutput(previousWriter)
	defer log.SetFlags(previousFlags)
	defer func() { activeLogLevel = previousLevel }()

	logOptionsDiagnostics(optionsFilepath, optionsData, addonConfigDir)

	output := buffer.String()
	checks := []string{
		`[DEBUG] listing options directory ` + "\"" + tempDir + "\"",
		"[DEBUG] options dir entry: options.json",
		"[DEBUG] options dir entry: providers/",
		`[DEBUG] listing addon config directory ` + "\"" + addonConfigDir + "\"",
		"[DEBUG] addon config dir entry: updates.json",
		`[DEBUG] options file dump ` + "\"" + optionsFilepath + "\"",
		string(optionsData),
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Fatalf("expected log output to contain %q, got:\n%s", check, output)
		}
	}
}

func TestMigrateLegacyDataFiles(t *testing.T) {
	setupBuffer := func(t *testing.T) (*bytes.Buffer, func()) {
		t.Helper()
		buffer := bytes.NewBuffer(nil)
		previousWriter := log.Writer()
		previousFlags := log.Flags()
		previousLevel := activeLogLevel
		log.SetOutput(buffer)
		log.SetFlags(0)
		activeLogLevel = logLevelDebug
		cleanup := func() {
			log.SetOutput(previousWriter)
			log.SetFlags(previousFlags)
			activeLogLevel = previousLevel
		}
		return buffer, cleanup
	}

	t.Run("moves non-options entries", func(t *testing.T) {
		dataDir := t.TempDir()
		configDir := filepath.Join(t.TempDir(), "config")
		if err := os.WriteFile(filepath.Join(dataDir, filepath.Base(haOptionsFilepath)), []byte("{}"), 0o600); err != nil {
			t.Fatalf("writing options file: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dataDir, "updates.json"), []byte("{}"), 0o600); err != nil {
			t.Fatalf("writing updates.json: %v", err)
		}
		if err := os.Mkdir(filepath.Join(dataDir, "cache"), 0o755); err != nil {
			t.Fatalf("creating cache dir: %v", err)
		}

		buffer, cleanup := setupBuffer(t)
		defer cleanup()

		if err := migrateLegacyDataFiles(dataDir, configDir); err != nil {
			t.Fatalf("migrating data files: %v", err)
		}

		if _, err := os.Stat(filepath.Join(dataDir, filepath.Base(haOptionsFilepath))); err != nil {
			t.Fatalf("expected options.json to remain in data dir: %v", err)
		}
		if _, err := os.Stat(filepath.Join(configDir, "updates.json")); err != nil {
			t.Fatalf("expected updates.json to be moved to config dir: %v", err)
		}
		if _, err := os.Stat(filepath.Join(configDir, "cache")); err != nil {
			t.Fatalf("expected cache dir to be moved to config dir: %v", err)
		}

		output := buffer.String()
		if !strings.Contains(output, "[INFO] Migrated legacy data") {
			t.Fatalf("expected migration info log, got:\n%s", output)
		}
	})

	t.Run("warns and skips existing destination", func(t *testing.T) {
		dataDir := t.TempDir()
		configDir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dataDir, "updates.json"), []byte("old"), 0o600); err != nil {
			t.Fatalf("writing source updates.json: %v", err)
		}
		if err := os.WriteFile(filepath.Join(configDir, "updates.json"), []byte("new"), 0o600); err != nil {
			t.Fatalf("writing destination updates.json: %v", err)
		}

		buffer, cleanup := setupBuffer(t)
		defer cleanup()

		if err := migrateLegacyDataFiles(dataDir, configDir); err != nil {
			t.Fatalf("migrating data files: %v", err)
		}

		data, err := os.ReadFile(filepath.Join(configDir, "updates.json"))
		if err != nil {
			t.Fatalf("reading destination updates.json: %v", err)
		}
		if string(data) != "new" {
			t.Fatalf("expected destination file to be kept, got %q", data)
		}

		output := buffer.String()
		if !strings.Contains(output, "[WARN] Skipping legacy data migration") {
			t.Fatalf("expected warning log, got:\n%s", output)
		}
	})

	t.Run("debug when nothing to migrate", func(t *testing.T) {
		dataDir := t.TempDir()
		configDir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dataDir, filepath.Base(haOptionsFilepath)), []byte("{}"), 0o600); err != nil {
			t.Fatalf("writing options file: %v", err)
		}

		buffer, cleanup := setupBuffer(t)
		defer cleanup()

		if err := migrateLegacyDataFiles(dataDir, configDir); err != nil {
			t.Fatalf("migrating data files: %v", err)
		}

		output := buffer.String()
		if !strings.Contains(output, "[DEBUG] No legacy data files found") {
			t.Fatalf("expected no-migration debug log, got:\n%s", output)
		}
	})
}
