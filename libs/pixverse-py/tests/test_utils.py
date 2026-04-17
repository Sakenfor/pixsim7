"""
Unit tests for pixverse/utils.py
Tests utility functions for image hashing and retries
"""

import pytest
import hashlib
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from pixverse.utils import compute_image_hash, compute_md5_hash


class TestComputeMD5Hash:
    """Test compute_md5_hash function"""

    def test_md5_hash_computation(self, tmp_path):
        """Test MD5 hash computation for a file"""
        # Create a test file
        test_file = tmp_path / "test.txt"
        test_file.write_text("Hello, World!")

        # Compute hash
        result = compute_md5_hash(test_file)

        # Expected MD5 hash (first 16 chars)
        expected = hashlib.md5(b"Hello, World!").hexdigest()[:16]
        assert result == expected

    def test_md5_hash_different_content(self, tmp_path):
        """Test that different content produces different hashes"""
        file1 = tmp_path / "file1.txt"
        file2 = tmp_path / "file2.txt"

        file1.write_text("Content A")
        file2.write_text("Content B")

        hash1 = compute_md5_hash(file1)
        hash2 = compute_md5_hash(file2)

        assert hash1 != hash2

    def test_md5_hash_same_content(self, tmp_path):
        """Test that same content produces same hash"""
        file1 = tmp_path / "file1.txt"
        file2 = tmp_path / "file2.txt"

        content = "Same content"
        file1.write_text(content)
        file2.write_text(content)

        hash1 = compute_md5_hash(file1)
        hash2 = compute_md5_hash(file2)

        assert hash1 == hash2

    def test_md5_hash_binary_file(self, tmp_path):
        """Test MD5 hash for binary file"""
        binary_file = tmp_path / "test.bin"
        binary_data = bytes([0, 1, 2, 3, 4, 5])
        binary_file.write_bytes(binary_data)

        result = compute_md5_hash(binary_file)
        expected = hashlib.md5(binary_data).hexdigest()[:16]

        assert result == expected


class TestComputeImageHash:
    """Test compute_image_hash function"""

    def test_image_hash_with_pil_available(self, tmp_path):
        """Test image hash computation when PIL is available"""
        # Create a simple test image file (we'll mock PIL)
        test_image = tmp_path / "test.png"
        test_image.write_bytes(b"fake image data")

        with patch('pixverse.utils.Image') as mock_image, \
             patch('pixverse.utils.imagehash') as mock_imagehash:

            # Mock PIL Image.open
            mock_img = MagicMock()
            mock_image.open.return_value.__enter__.return_value = mock_img

            # Mock imagehash.phash
            mock_hash = Mock()
            mock_hash.__str__ = Mock(return_value="abc123def456")
            mock_imagehash.phash.return_value = mock_hash

            result = compute_image_hash(test_image)

            assert result == "abc123def456"
            mock_image.open.assert_called_once()
            mock_imagehash.phash.assert_called_once_with(mock_img)

    def test_image_hash_fallback_to_md5_on_import_error(self, tmp_path):
        """Test that compute_image_hash falls back to MD5 when PIL not available"""
        test_file = tmp_path / "test.png"
        test_file.write_bytes(b"fake image data")

        # Mock ImportError when trying to import PIL
        with patch('pixverse.utils.Image', side_effect=ImportError):
            result = compute_image_hash(test_file)

            # Should fall back to MD5
            expected = hashlib.md5(b"fake image data").hexdigest()[:16]
            assert result == expected

    def test_image_hash_fallback_to_md5_on_io_error(self, tmp_path):
        """Test that compute_image_hash falls back to MD5 on IO error"""
        test_file = tmp_path / "test.png"
        test_file.write_bytes(b"fake image data")

        with patch('pixverse.utils.Image') as mock_image:
            # Mock OSError when opening image
            mock_image.open.side_effect = OSError("Cannot identify image file")

            result = compute_image_hash(test_file)

            # Should fall back to MD5
            expected = hashlib.md5(b"fake image data").hexdigest()[:16]
            assert result == expected

    def test_image_hash_different_images(self, tmp_path):
        """Test that different images produce different hashes"""
        # Using MD5 fallback for simplicity
        with patch('pixverse.utils.Image', side_effect=ImportError):
            image1 = tmp_path / "image1.png"
            image2 = tmp_path / "image2.png"

            image1.write_bytes(b"image data 1")
            image2.write_bytes(b"image data 2")

            hash1 = compute_image_hash(image1)
            hash2 = compute_image_hash(image2)

            assert hash1 != hash2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
