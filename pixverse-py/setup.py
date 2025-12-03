"""
Setup configuration for pixverse-py SDK
"""
from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="pixverse",
    version="1.0.0",
    author="Sakenfor",
    description="Python SDK for Pixverse AI video and image generation",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Sakenfor/pixverse-py",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "pydantic>=2.0.0",
    ],
)
