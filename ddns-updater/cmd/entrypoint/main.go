package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"syscall"
)

const defaultHAOptionsFilepath = "/updater/data/options.json"

func main() {
	optionsFilepath := envOrDefault("HA_OPTIONS_FILEPATH", defaultHAOptionsFilepath)

	// Read Home Assistant options from the configured filepath.
	optionsData, err := os.ReadFile(optionsFilepath)
	if err != nil {
		log.Fatalf("Failed to read options file %q: %v", optionsFilepath, err)
	}

	// Parse options
	var options struct {
		Environments map[string]interface{} `json:"environments"`
	}

	if err := json.Unmarshal(optionsData, &options); err != nil {
		log.Fatalf("Failed to parse options.json: %v", err)
	}

	log.Printf("Using options file as ddns-updater config: %s", optionsFilepath)

	// Merge all environment overrides from options and ensure config filepath points
	// to the mapped Home Assistant options file.
	env, err := mergedEnvironment(os.Environ(), options.Environments)
	if err != nil {
		log.Fatalf("Failed to build environment: %v", err)
	}
	env = setEnv(env, "CONFIG_FILEPATH", optionsFilepath)

	// Replace this process with ddns-updater using syscall.Exec
	err = syscall.Exec("/updater/ddns-updater", []string{"ddns-updater"}, env)
	if err != nil {
		log.Fatalf("Failed to exec ddns-updater: %v", err)
	}
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
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
