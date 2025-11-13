"""
HTTP handler for sending logs to ingestion endpoint.

Optional handler that sends structured logs to a centralized API endpoint.
Enabled via PIXSIM_LOG_INGESTION_URL environment variable.
"""
import os
import json
import requests
from typing import Any
from queue import Queue
from threading import Thread, Event
import time


class HTTPLogHandler:
    """
    Asynchronous HTTP handler for log ingestion.

    Sends logs to a configured endpoint in batches via background thread.
    Designed to minimize performance impact on logging calls.
    """

    def __init__(
        self,
        ingestion_url: str,
        batch_size: int = 10,
        flush_interval: float = 5.0,
        timeout: float = 2.0
    ):
        """
        Initialize HTTP log handler.

        Args:
            ingestion_url: URL of log ingestion endpoint
            batch_size: Number of logs to batch before sending
            flush_interval: Maximum time to wait before flushing batch (seconds)
            timeout: HTTP request timeout (seconds)
        """
        self.ingestion_url = ingestion_url
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.timeout = timeout

        self.queue: Queue = Queue(maxsize=1000)
        self.shutdown_event = Event()
        self.worker_thread = Thread(target=self._worker, daemon=True)
        self.worker_thread.start()

    def __call__(self, logger, method_name: str, event_dict: dict[str, Any]):
        """
        Structlog processor that queues logs for HTTP transmission.

        Args:
            logger: Logger instance
            method_name: Log method name
            event_dict: Event dictionary

        Returns:
            Unmodified event_dict (passthrough processor)
        """
        # Queue a copy of the event for background transmission
        try:
            self.queue.put_nowait(event_dict.copy())
        except:
            # Queue full, drop log to avoid blocking
            pass

        # Return event unchanged (this is a passthrough processor)
        return event_dict

    def _worker(self):
        """
        Background worker that batches and sends logs.
        """
        batch = []
        last_flush = time.time()

        while not self.shutdown_event.is_set():
            try:
                # Try to get a log entry (non-blocking)
                try:
                    log_entry = self.queue.get(timeout=0.1)
                    batch.append(log_entry)
                except:
                    pass

                # Flush if batch is full or interval exceeded
                should_flush = (
                    len(batch) >= self.batch_size or
                    (len(batch) > 0 and time.time() - last_flush >= self.flush_interval)
                )

                if should_flush:
                    self._flush_batch(batch)
                    batch = []
                    last_flush = time.time()

            except Exception:
                # Silently ignore errors to avoid breaking logging
                pass

        # Final flush on shutdown
        if batch:
            self._flush_batch(batch)

    def _flush_batch(self, batch: list[dict]):
        """
        Send batch of logs to ingestion endpoint.

        Args:
            batch: List of log entries to send
        """
        if not batch:
            return

        try:
            # Prepare payload
            payload = {"logs": batch}

            # Send to ingestion endpoint
            response = requests.post(
                self.ingestion_url,
                json=payload,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"}
            )

            # Log failures (to stderr, not via structured logging to avoid recursion)
            if response.status_code != 200:
                print(f"[HTTPLogHandler] Failed to ingest logs: {response.status_code}", flush=True)

        except Exception as e:
            # Silently ignore to avoid breaking application
            # Could optionally log to stderr for debugging
            print(f"[HTTPLogHandler] Error sending logs: {e}", flush=True)

    def shutdown(self):
        """
        Shutdown handler and flush remaining logs.
        """
        self.shutdown_event.set()
        self.worker_thread.join(timeout=5.0)


def create_http_handler_from_env() -> HTTPLogHandler | None:
    """
    Create HTTP handler from environment variables.

    Environment variables:
        PIXSIM_LOG_INGESTION_URL: URL of ingestion endpoint
        PIXSIM_LOG_INGESTION_BATCH_SIZE: Batch size (default: 10)
        PIXSIM_LOG_INGESTION_FLUSH_INTERVAL: Flush interval in seconds (default: 5.0)

    Returns:
        HTTPLogHandler if URL is configured, None otherwise
    """
    url = os.getenv("PIXSIM_LOG_INGESTION_URL")
    if not url:
        return None

    batch_size = int(os.getenv("PIXSIM_LOG_INGESTION_BATCH_SIZE", "10"))
    flush_interval = float(os.getenv("PIXSIM_LOG_INGESTION_FLUSH_INTERVAL", "5.0"))

    return HTTPLogHandler(
        ingestion_url=url,
        batch_size=batch_size,
        flush_interval=flush_interval
    )
