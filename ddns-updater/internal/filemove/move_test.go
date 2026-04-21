package filemove

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

func TestMovePath(t *testing.T) {
	t.Run("falls back to copy for cross-device file move", func(t *testing.T) {
		sourceDir := t.TempDir()
		destinationDir := t.TempDir()
		sourcePath := filepath.Join(sourceDir, "updates.json")
		destinationPath := filepath.Join(destinationDir, "updates.json")
		if err := os.WriteFile(sourcePath, []byte("payload"), 0o640); err != nil {
			t.Fatalf("writing source file: %v", err)
		}

		previousRename := renamePath
		renamePath = func(_, _ string) error {
			return &os.LinkError{Op: "rename", Err: syscall.EXDEV}
		}
		defer func() { renamePath = previousRename }()

		if err := MovePath(sourcePath, destinationPath); err != nil {
			t.Fatalf("moving path: %v", err)
		}

		if _, err := os.Stat(sourcePath); !os.IsNotExist(err) {
			t.Fatalf("expected source file removed, got err=%v", err)
		}
		data, err := os.ReadFile(destinationPath)
		if err != nil {
			t.Fatalf("reading destination file: %v", err)
		}
		if string(data) != "payload" {
			t.Fatalf("unexpected destination content %q", data)
		}
	})

	t.Run("falls back to copy for cross-device directory move", func(t *testing.T) {
		sourceRoot := t.TempDir()
		destinationRoot := t.TempDir()
		sourcePath := filepath.Join(sourceRoot, "cache")
		destinationPath := filepath.Join(destinationRoot, "cache")
		if err := os.MkdirAll(filepath.Join(sourcePath, "nested"), 0o755); err != nil {
			t.Fatalf("creating source directory: %v", err)
		}
		if err := os.WriteFile(filepath.Join(sourcePath, "nested", "state.txt"), []byte("ok"), 0o600); err != nil {
			t.Fatalf("writing nested file: %v", err)
		}

		previousRename := renamePath
		renamePath = func(_, _ string) error {
			return &os.LinkError{Op: "rename", Err: syscall.EXDEV}
		}
		defer func() { renamePath = previousRename }()

		if err := MovePath(sourcePath, destinationPath); err != nil {
			t.Fatalf("moving directory: %v", err)
		}

		if _, err := os.Stat(sourcePath); !os.IsNotExist(err) {
			t.Fatalf("expected source directory removed, got err=%v", err)
		}
		data, err := os.ReadFile(filepath.Join(destinationPath, "nested", "state.txt"))
		if err != nil {
			t.Fatalf("reading destination nested file: %v", err)
		}
		if string(data) != "ok" {
			t.Fatalf("unexpected nested content %q", data)
		}
	})

	t.Run("returns non cross-device rename errors", func(t *testing.T) {
		previousRename := renamePath
		renamePath = func(_, _ string) error {
			return os.ErrPermission
		}
		defer func() { renamePath = previousRename }()

		err := MovePath("/tmp/a", "/tmp/b")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !strings.Contains(err.Error(), os.ErrPermission.Error()) {
			t.Fatalf("expected permission error, got %v", err)
		}
	})
}
