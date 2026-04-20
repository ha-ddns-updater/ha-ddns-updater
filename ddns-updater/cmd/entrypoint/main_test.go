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
	optionsData := []byte("{\n  \"environments\": {\"LOG_LEVEL\": \"debug\"}\n}\n")
	if err := os.WriteFile(optionsFilepath, optionsData, 0o600); err != nil {
		t.Fatalf("writing options file: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tempDir, "providers"), 0o755); err != nil {
		t.Fatalf("creating providers dir: %v", err)
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

	logOptionsDiagnostics(optionsFilepath, optionsData)

	output := buffer.String()
	checks := []string{
		`[DEBUG] listing options directory ` + "\"" + tempDir + "\"",
		"[DEBUG] options dir entry: options.json",
		"[DEBUG] options dir entry: providers/",
		`[DEBUG] options file dump ` + "\"" + optionsFilepath + "\"",
		string(optionsData),
	}
	for _, check := range checks {
		if !strings.Contains(output, check) {
			t.Fatalf("expected log output to contain %q, got:\n%s", check, output)
		}
	}
}
