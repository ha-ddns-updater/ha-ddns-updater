package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/ha-ddns-updater/ha-ddns-updater/internal/filemove"
)

const (
	haOptionsFilepath    = "/data/options.json"
	haDataDirectory      = "/data"
	addonConfigDirectory = "/config"
	ddnsUpdaterBinary    = "/updater/ddns-updater"
)

type logLevel int

const (
	logLevelDebug logLevel = iota
	logLevelInfo
	logLevelWarn
	logLevelError
	logLevelFatal
)

var activeLogLevel = logLevelInfo

func main() {
	// Read Home Assistant options from the default Supervisor-mounted filepath.
	optionsData, err := os.ReadFile(haOptionsFilepath)
	if err != nil {
		fatalf("Failed to read options file %q: %v", haOptionsFilepath, err)
	}

	// Parse options
	var options struct {
		Environments map[string]interface{} `json:"environments"`
	}

	if err := json.Unmarshal(optionsData, &options); err != nil {
		fatalf("Failed to parse options.json: %v", err)
	}

	activeLogLevel = parseLogLevel(options.Environments["LOG_LEVEL"])

	if err := migrateLegacyDataFiles(haDataDirectory, addonConfigDirectory); err != nil {
		fatalf("Failed migrating legacy data files: %v", err)
	}

	if shouldLog(logLevelDebug) {
		logOptionsDiagnostics(haOptionsFilepath, optionsData, addonConfigDirectory)
	}

	logf(logLevelInfo, "Using options file as ddns-updater config: %s", haOptionsFilepath)

	// Merge environment overrides from options and then force path-related values
	// needed for Home Assistant mounts.
	env, err := mergedEnvironment(os.Environ(), options.Environments)
	if err != nil {
		fatalf("Failed to build environment: %v", err)
	}
	env = setEnv(env, "CONFIG_FILEPATH", haOptionsFilepath)
	env = setEnv(env, "DATADIR", addonConfigDirectory)
	env = setEnv(env, "BACKUP_DIRECTORY", addonConfigDirectory)

	// Fetch the ingress path from the HA Supervisor API and inject it as
	// ROOT_URL so ddns-updater serves assets correctly behind the ingress proxy.
	// This is skipped gracefully when not running under HA (no SUPERVISOR_TOKEN).
	if ingressPath, err := fetchIngressPath(); err != nil {
		logf(logLevelWarn, "Could not fetch ingress path from Supervisor API (not running under HA?): %v", err)
	} else if ingressPath != "" {
		logf(logLevelInfo, "Setting ROOT_URL to ingress path: %s", ingressPath)
		env = setEnv(env, "ROOT_URL", ingressPath)
	}

	// Replace this process with ddns-updater using syscall.Exec
	err = syscall.Exec(ddnsUpdaterBinary, []string{"ddns-updater"}, env)
	if err != nil {
		fatalf("Failed to exec ddns-updater: %v", err)
	}
}

func parseLogLevel(value interface{}) logLevel {
	if value == nil {
		return logLevelInfo
	}

	switch strings.ToLower(strings.TrimSpace(fmt.Sprint(value))) {
	case "debug":
		return logLevelDebug
	case "warn", "warning":
		return logLevelWarn
	case "error":
		return logLevelError
	case "fatal":
		return logLevelFatal
	default:
		return logLevelInfo
	}
}

func logOptionsDiagnostics(optionsFilepath string, optionsData []byte, addonConfigDir string) {
	optionsDir := filepath.Dir(optionsFilepath)
	logDirectoryEntries("options", optionsDir)
	logDirectoryEntries("addon config", addonConfigDir)

	logf(logLevelDebug, "options file dump %q:\n%s", optionsFilepath, optionsData)
}

func logDirectoryEntries(label, directory string) {
	logf(logLevelDebug, "listing %s directory %q", label, directory)

	entries, err := os.ReadDir(directory)
	if err != nil {
		logf(logLevelDebug, "failed to list %s directory %q: %v", label, directory, err)
	} else {
		for _, line := range formatDirEntries(entries) {
			logf(logLevelDebug, "%s dir entry: %s", label, line)
		}
	}
}

func formatDirEntries(entries []os.DirEntry) []string {
	if len(entries) == 0 {
		return []string{"<empty>"}
	}

	lines := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			name += "/"
		}
		lines = append(lines, name)
	}
	return lines
}

func mergedEnvironment(base []string, overrides map[string]interface{}) ([]string, error) {
	envMap := make(map[string]string, len(base)+len(overrides))

	for _, pair := range base {
		key, value, found := strings.Cut(pair, "=")
		if !found || key == "" {
			continue
		}
		envMap[key] = value
	}

	for key, value := range overrides {
		if key == "" || strings.Contains(key, "=") {
			return nil, fmt.Errorf("invalid environment key %q", key)
		}
		envMap[key] = fmt.Sprint(value)
	}

	keys := make([]string, 0, len(envMap))
	for key := range envMap {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	result := make([]string, 0, len(keys))
	for _, key := range keys {
		result = append(result, key+"="+envMap[key])
	}

	return result, nil
}

func setEnv(env []string, key, value string) []string {
	prefix := key + "="
	for i, pair := range env {
		if strings.HasPrefix(pair, prefix) {
			env[i] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func migrateLegacyDataFiles(fromDir, toDir string) error {
	if err := os.MkdirAll(toDir, 0o755); err != nil {
		return fmt.Errorf("creating destination directory %q: %w", toDir, err)
	}

	entries, err := os.ReadDir(fromDir)
	if err != nil {
		return fmt.Errorf("listing source directory %q: %w", fromDir, err)
	}

	migratedAny := false
	for _, entry := range entries {
		name := entry.Name()
		if name == filepath.Base(haOptionsFilepath) {
			continue
		}

		sourcePath := filepath.Join(fromDir, name)
		destinationPath := filepath.Join(toDir, name)

		if _, statErr := os.Stat(destinationPath); statErr == nil {
			logf(logLevelWarn, "Skipping legacy data migration for %q: destination %q already exists", sourcePath, destinationPath)
			continue
		} else if !os.IsNotExist(statErr) {
			return fmt.Errorf("checking destination %q: %w", destinationPath, statErr)
		}

		if renameErr := filemove.MovePath(sourcePath, destinationPath); renameErr != nil {
			return fmt.Errorf("moving %q to %q: %w", sourcePath, destinationPath, renameErr)
		}

		migratedAny = true
		logf(logLevelInfo, "Migrated legacy data from %q to %q", sourcePath, destinationPath)
	}

	if !migratedAny {
		logf(logLevelDebug, "No legacy data files found in %q that require migration", fromDir)
	}

	return nil
}

func shouldLog(level logLevel) bool {
	if level == logLevelFatal {
		return true
	}
	return level >= activeLogLevel
}

func (l logLevel) String() string {
	switch l {
	case logLevelDebug:
		return "DEBUG"
	case logLevelInfo:
		return "INFO"
	case logLevelWarn:
		return "WARN"
	case logLevelError:
		return "ERROR"
	case logLevelFatal:
		return "FATAL"
	default:
		return "INFO"
	}
}

func logf(level logLevel, format string, args ...interface{}) {
	if !shouldLog(level) {
		return
	}
	allArgs := append([]interface{}{level.String()}, args...)
	log.Printf("[%s] "+format, allArgs...)
}

func fatalf(format string, args ...interface{}) {
	logf(logLevelFatal, format, args...)
	os.Exit(1)
}

// fetchIngressPath queries the HA Supervisor API to retrieve the ingress path
// for this addon (e.g. "/api/hassio_ingress/abc123/"). Returns an empty string
// and no error when the addon has no ingress path configured.
func fetchIngressPath() (string, error) {
	supervisorToken := os.Getenv("SUPERVISOR_TOKEN")
	if supervisorToken == "" {
		return "", fmt.Errorf("SUPERVISOR_TOKEN not set")
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodGet, "http://supervisor/addons/self/info", nil)
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+supervisorToken)

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling Supervisor API: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf(logLevelWarn, "Failed to close Supervisor API response body: %v", closeErr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Supervisor API returned status %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			IngressPath string `json:"ingress_path"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decoding Supervisor API response: %w", err)
	}

	return result.Data.IngressPath, nil
}
