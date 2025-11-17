"""
Windows Job Objects - Robust process tree management on Windows.

Job Objects automatically track all child/grandchild processes and allow
reliable termination of entire process trees with a single call.

This is especially useful for processes like npm/node that spawn many children.
"""

import os
import sys
from typing import Optional

# Only import Windows-specific modules on Windows
if os.name == 'nt':
    import ctypes
    from ctypes import wintypes

    # Windows API constants
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
    JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800

    # Job Object Information Classes
    JobObjectBasicLimitInformation = 2
    JobObjectExtendedLimitInformation = 9

    # Access rights
    JOB_OBJECT_ALL_ACCESS = 0x1F001F

    # Structure definitions
    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ('PerProcessUserTimeLimit', wintypes.LARGE_INTEGER),
            ('PerJobUserTimeLimit', wintypes.LARGE_INTEGER),
            ('LimitFlags', wintypes.DWORD),
            ('MinimumWorkingSetSize', ctypes.c_size_t),
            ('MaximumWorkingSetSize', ctypes.c_size_t),
            ('ActiveProcessLimit', wintypes.DWORD),
            ('Affinity', ctypes.POINTER(wintypes.ULONG)),
            ('PriorityClass', wintypes.DWORD),
            ('SchedulingClass', wintypes.DWORD),
        ]

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ('ReadOperationCount', wintypes.ULARGE_INTEGER),
            ('WriteOperationCount', wintypes.ULARGE_INTEGER),
            ('OtherOperationCount', wintypes.ULARGE_INTEGER),
            ('ReadTransferCount', wintypes.ULARGE_INTEGER),
            ('WriteTransferCount', wintypes.ULARGE_INTEGER),
            ('OtherTransferCount', wintypes.ULARGE_INTEGER),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ('BasicLimitInformation', JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ('IoInfo', IO_COUNTERS),
            ('ProcessMemoryLimit', ctypes.c_size_t),
            ('JobMemoryLimit', ctypes.c_size_t),
            ('PeakProcessMemoryUsed', ctypes.c_size_t),
            ('PeakJobMemoryUsed', ctypes.c_size_t),
        ]

    # Windows API functions
    kernel32 = ctypes.windll.kernel32

    CreateJobObjectW = kernel32.CreateJobObjectW
    CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
    CreateJobObjectW.restype = wintypes.HANDLE

    OpenProcess = kernel32.OpenProcess
    OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    OpenProcess.restype = wintypes.HANDLE

    AssignProcessToJobObject = kernel32.AssignProcessToJobObject
    AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    AssignProcessToJobObject.restype = wintypes.BOOL

    SetInformationJobObject = kernel32.SetInformationJobObject
    SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        wintypes.LPVOID,
        wintypes.DWORD
    ]
    SetInformationJobObject.restype = wintypes.BOOL

    CloseHandle = kernel32.CloseHandle
    CloseHandle.argtypes = [wintypes.HANDLE]
    CloseHandle.restype = wintypes.BOOL

    TerminateJobObject = kernel32.TerminateJobObject
    TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    TerminateJobObject.restype = wintypes.BOOL

    PROCESS_TERMINATE = 0x0001
    PROCESS_SET_QUOTA = 0x0100


class WindowsJobObject:
    """
    Windows Job Object wrapper for managing process trees.

    When a process is assigned to a Job Object, all its child and grandchild
    processes are automatically tracked. When the job is terminated or closed,
    all processes in the job are terminated automatically.

    This is much more reliable than manually tracking and killing process trees.
    """

    def __init__(self, name: Optional[str] = None):
        """
        Create a new Job Object.

        Args:
            name: Optional name for the job (for debugging)
        """
        if os.name != 'nt':
            raise RuntimeError("WindowsJobObject only works on Windows")

        self.name = name
        self.handle = None
        self._create_job()

    def _create_job(self):
        """Create the Windows Job Object and configure it."""
        # Create the job object
        self.handle = CreateJobObjectW(None, self.name)
        if not self.handle:
            raise RuntimeError(f"Failed to create Job Object: {ctypes.get_last_error()}")

        # Configure the job to kill all processes when the job handle is closed
        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = (
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |  # Kill processes when job closes
            JOB_OBJECT_LIMIT_BREAKAWAY_OK          # Allow processes to break away if needed
        )

        success = SetInformationJobObject(
            self.handle,
            JobObjectExtendedLimitInformation,
            ctypes.byref(info),
            ctypes.sizeof(info)
        )

        if not success:
            CloseHandle(self.handle)
            raise RuntimeError(f"Failed to configure Job Object: {ctypes.get_last_error()}")

    def assign_process(self, pid: int) -> bool:
        """
        Assign a process to this job.

        All child processes spawned by this process will automatically be
        added to the job as well.

        Args:
            pid: Process ID to assign

        Returns:
            True if successful, False otherwise
        """
        if not self.handle:
            return False

        # Open handle to the process
        process_handle = OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, False, pid)
        if not process_handle:
            return False

        try:
            # Assign process to job
            success = AssignProcessToJobObject(self.handle, process_handle)
            return bool(success)
        finally:
            CloseHandle(process_handle)

    def terminate(self, exit_code: int = 1) -> bool:
        """
        Terminate all processes in the job.

        This will kill the entire process tree immediately.

        Args:
            exit_code: Exit code for terminated processes

        Returns:
            True if successful
        """
        if not self.handle:
            return False

        success = TerminateJobObject(self.handle, exit_code)
        return bool(success)

    def close(self):
        """
        Close the job handle.

        If JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE was set (which it is by default),
        all processes in the job will be terminated automatically.
        """
        if self.handle:
            CloseHandle(self.handle)
            self.handle = None

    def __del__(self):
        """Ensure job is closed when object is garbage collected."""
        self.close()

    def __enter__(self):
        """Context manager support."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager support - close on exit."""
        self.close()


def is_available() -> bool:
    """Check if Windows Job Objects are available on this platform."""
    return os.name == 'nt'
