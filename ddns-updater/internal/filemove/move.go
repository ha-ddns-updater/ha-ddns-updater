package filemove

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
)

var renamePath = os.Rename

// MovePath moves a file or directory from sourcePath to destinationPath.
// It falls back to copy+delete when rename crosses filesystem boundaries.
func MovePath(sourcePath, destinationPath string) error {
	err := renamePath(sourcePath, destinationPath)
	if err == nil {
		return nil
	}
	if !errors.Is(err, syscall.EXDEV) {
		return err
	}

	info, statErr := os.Lstat(sourcePath)
	if statErr != nil {
		return fmt.Errorf("stating source path: %w", statErr)
	}

	if info.IsDir() {
		if copyErr := copyDirectory(sourcePath, destinationPath); copyErr != nil {
			return fmt.Errorf("copying directory across devices: %w", copyErr)
		}
	} else {
		if copyErr := copyFile(sourcePath, destinationPath, info.Mode()); copyErr != nil {
			return fmt.Errorf("copying file across devices: %w", copyErr)
		}
	}

	if removeErr := os.RemoveAll(sourcePath); removeErr != nil {
		return fmt.Errorf("removing source after cross-device copy: %w", removeErr)
	}

	return nil
}

func copyDirectory(sourceDir, destinationDir string) error {
	return filepath.WalkDir(sourceDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relativePath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return fmt.Errorf("computing relative path for %q: %w", path, err)
		}
		targetPath := filepath.Join(destinationDir, relativePath)

		if d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return fmt.Errorf("reading directory info for %q: %w", path, err)
			}
			if err := os.MkdirAll(targetPath, info.Mode().Perm()); err != nil {
				return fmt.Errorf("creating directory %q: %w", targetPath, err)
			}
			return nil
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return fmt.Errorf("creating parent directory for %q: %w", targetPath, err)
		}

		info, err := d.Info()
		if err != nil {
			return fmt.Errorf("reading file info for %q: %w", path, err)
		}

		if info.Mode()&os.ModeSymlink != 0 {
			linkTarget, err := os.Readlink(path)
			if err != nil {
				return fmt.Errorf("reading symlink %q: %w", path, err)
			}
			if err := os.Symlink(linkTarget, targetPath); err != nil {
				return fmt.Errorf("creating symlink %q: %w", targetPath, err)
			}
			return nil
		}

		return copyFile(path, targetPath, info.Mode())
	})
}

func copyFile(sourcePath, destinationPath string, mode fs.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
		return fmt.Errorf("creating parent directory for %q: %w", destinationPath, err)
	}

	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("opening source file %q: %w", sourcePath, err)
	}
	defer func() {
		_ = sourceFile.Close()
	}()

	destinationFile, err := os.OpenFile(destinationPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode.Perm())
	if err != nil {
		return fmt.Errorf("opening destination file %q: %w", destinationPath, err)
	}
	defer func() {
		_ = destinationFile.Close()
	}()

	if _, err := io.Copy(destinationFile, sourceFile); err != nil {
		return fmt.Errorf("copying file content: %w", err)
	}

	return nil
}
