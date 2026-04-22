"""
Logging utilities for YT Short Clipper
"""

import sys
import os
import threading
import traceback
from datetime import datetime
from pathlib import Path


# Enable console logging when running from terminal (not frozen)
DEBUG_MODE = not getattr(sys, 'frozen', False)

# Error log file path (will be set by setup_error_logging)
ERROR_LOG_FILE = None


def setup_error_logging(app_dir: Path):
    """Setup error logging to file
    
    Args:
        app_dir: Application directory where error.log will be created
    """
    global ERROR_LOG_FILE
    ERROR_LOG_FILE = app_dir / "error.log"
    
    # Create log file if not exists
    if not ERROR_LOG_FILE.exists():
        ERROR_LOG_FILE.touch()
    
    # Redirect stderr to file for uncaught exceptions
    sys.stderr = ErrorLogWriter(ERROR_LOG_FILE)


class ErrorLogWriter:
    """Custom writer that writes to both file and devnull"""
    
    def __init__(self, log_file: Path):
        self.log_file = log_file
        self.terminal = sys.__stderr__  # Keep reference to original stderr
        self._file = open(log_file, 'a', encoding='utf-8')
        self._lock = threading.Lock()
    
    def write(self, message):
        """Write message to log file"""
        if message.strip():  # Only write non-empty messages
            try:
                with self._lock:
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    self._file.write(f"[{timestamp}] {message}")
                    if not message.endswith('\n'):
                        self._file.write('\n')
                    self._file.flush()
            except Exception:
                pass  # Silently fail if can't write to log
    
    def flush(self):
        """Flush - required for file-like object"""
        try:
            self._file.flush()
        except Exception:
            pass


def debug_log(msg):
    """Log to console only in debug mode (running from terminal)"""
    if DEBUG_MODE:
        print(f"[DEBUG] {msg}")


def log_error(error_msg: str, exception: Exception = None):
    """Log error to file with timestamp and traceback
    
    Args:
        error_msg: Human-readable error message
        exception: Optional exception object to log traceback
    """
    if ERROR_LOG_FILE is None:
        return
    
    try:
        with open(ERROR_LOG_FILE, 'a', encoding='utf-8') as f:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"\n{'='*80}\n")
            f.write(f"[{timestamp}] ERROR\n")
            f.write(f"{'='*80}\n")
            f.write(f"{error_msg}\n")
            
            if exception:
                f.write(f"\nException Type: {type(exception).__name__}\n")
                f.write(f"Exception Message: {str(exception)}\n")
                f.write(f"\nTraceback:\n")
                f.write(traceback.format_exc())
            
            f.write(f"{'='*80}\n\n")
    except Exception:
        pass  # Silently fail if can't write to log


def get_error_log_path() -> Path:
    """Get the path to error log file"""
    return ERROR_LOG_FILE
