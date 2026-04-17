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

func main() {
	// Read Home Assistant options from /data/options.json
	optionsData, err := os.ReadFile("/data/options.json")
	if err != nil {
		log.Fatalf("Failed to read options.json: %v", err)
	}

	// Parse options
	var options struct {
		Settings     []map[string]interface{} `json:"settings"`
		Environments map[string]interface{}   `json:"environments"`
	}

	if err := json.Unmarshal(optionsData, &options); err != nil {
		log.Fatalf("Failed to parse options.json: %v", err)
	}

	// Build config for qdm12
	config := map[string]interface{}{
		"settings": options.Settings,
	}

	configJSON, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal config: %v", err)
	}

	// Write config to qdm12's expected location
	err = os.WriteFile("/updater/data/config.json", configJSON, 0o644)
	if err != nil {
		log.Fatalf("Failed to write config.json: %v", err)
	}

	log.Printf("Config written to /updater/data/config.json")
	log.Printf("Settings: %d provider(s) configured", len(options.Settings))

	// Merge all environment overrides from options and ensure config filepath points
	// to the generated file.
	env, err := mergedEnvironment(os.Environ(), options.Environments)
	if err != nil {
		log.Fatalf("Failed to build environment: %v", err)
	}
	env = setEnv(env, "CONFIG_FILEPATH", "/updater/data/config.json")

	// Replace this process with ddns-updater using syscall.Exec
	err = syscall.Exec("/updater/ddns-updater", []string{"ddns-updater"}, env)
	if err != nil {
		log.Fatalf("Failed to exec ddns-updater: %v", err)
	}
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
