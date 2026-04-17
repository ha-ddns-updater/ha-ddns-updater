package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
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
		Settings      []map[string]interface{} `json:"settings"`
		Period        string                   `json:"period"`
		ServerEnabled bool                     `json:"server_enabled"`
		LogLevel      string                   `json:"log_level"`
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

	// Set up environment variables for qdm12
	env := os.Environ()

	// Set PERIOD from options
	if options.Period != "" {
		env = append(env, fmt.Sprintf("PERIOD=%s", options.Period))
	}

	// Set SERVER_ENABLED from options
	if options.ServerEnabled {
		env = append(env, "SERVER_ENABLED=yes")
	} else {
		env = append(env, "SERVER_ENABLED=no")
	}

	// Set LOG_LEVEL from options
	if options.LogLevel != "" {
		env = append(env, fmt.Sprintf("LOG_LEVEL=%s", options.LogLevel))
	}

	// Ensure CONFIG_FILEPATH points to our config
	env = append(env, "CONFIG_FILEPATH=/updater/data/config.json")

	// Replace this process with ddns-updater using syscall.Exec
	err = syscall.Exec("/updater/ddns-updater", []string{"ddns-updater"}, env)
	if err != nil {
		log.Fatalf("Failed to exec ddns-updater: %v", err)
	}
}
