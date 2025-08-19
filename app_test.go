package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// helper to create a temporary ffmpeg stub
func makeFFmpegStub(t *testing.T, script string) (func(), string) {
	t.Helper()
	dir := t.TempDir()
	stub := filepath.Join(dir, "ffmpeg")
	if err := os.WriteFile(stub, []byte(script), 0755); err != nil {
		t.Fatalf("failed to write stub: %v", err)
	}
	oldPath := os.Getenv("PATH")
	os.Setenv("PATH", dir+":"+oldPath)
	cleanup := func() {
		os.Setenv("PATH", oldPath)
	}
	return cleanup, dir
}

func TestTryFastMerge_CodecMismatch(t *testing.T) {
	script := "#!/bin/sh\necho 'codec mismatch' >&2\nexit 1\n"
	cleanup, _ := makeFFmpegStub(t, script)
	defer cleanup()

	err := tryFastMerge(context.Background(), []string{"a.mp4", "b.mp4"}, "out.mp4")
	if err == nil || !strings.Contains(err.Error(), "codec mismatch") {
		t.Fatalf("expected codec mismatch error, got %v", err)
	}
}

func TestResolutionMismatchTriggersReencode(t *testing.T) {
	videos := []VideoFile{
		{Path: "a.mp4", Codec: "h264", Resolution: "640x360", HasAudio: true},
		{Path: "b.mp4", Codec: "h264", Resolution: "1280x720", HasAudio: true},
	}
	if looksFastMergeable(videos) {
		t.Fatalf("expected videos to require re-encoding due to resolution mismatch")
	}

	script := "#!/bin/sh\necho \"$@\" > \"$STUB_CALLED\"\nexit 0\n"
	cleanup, dir := makeFFmpegStub(t, script)
	defer cleanup()
	calledFile := filepath.Join(dir, "called.txt")
	os.Setenv("STUB_CALLED", calledFile)
	defer os.Unsetenv("STUB_CALLED")

	cmd := exec.CommandContext(context.Background(), "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", videos[0].Path,
		"-vf", "scale=1280:720:force_original_aspect_ratio=decrease,setsar=1,format=yuv420p,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-an", filepath.Join(dir, "out.mp4"))
	if err := cmd.Run(); err != nil {
		t.Fatalf("expected mock ffmpeg to succeed: %v", err)
	}

	data, err := os.ReadFile(calledFile)
	if err != nil {
		t.Fatalf("failed to read stub output: %v", err)
	}
	if !strings.Contains(string(data), "-vf") {
		t.Fatalf("expected re-encode command to include -vf, got: %s", string(data))
	}
}

func TestTryFastMerge_NoChangesWhenCompatible(t *testing.T) {
	script := "#!/bin/sh\necho \"$@\" > \"$STUB_CALLED\"\nexit 0\n"
	cleanup, dir := makeFFmpegStub(t, script)
	defer cleanup()
	calledFile := filepath.Join(dir, "called.txt")
	os.Setenv("STUB_CALLED", calledFile)
	defer os.Unsetenv("STUB_CALLED")

	err := tryFastMerge(context.Background(), []string{"a.mp4", "b.mp4"}, "out.mp4")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	data, err := os.ReadFile(calledFile)
	if err != nil {
		t.Fatalf("failed to read stub output: %v", err)
	}
	if !strings.Contains(string(data), "-c copy") {
		t.Fatalf("expected fast merge to use copy codec, got: %s", string(data))
	}
}
