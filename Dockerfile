# Multi-stage build for PANfm
# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

# Set metadata
LABEL maintainer="PANfm"
LABEL description="Palo Alto Networks Firewall Monitor"
LABEL version="1.0"

# Create non-root user for security
RUN useradd -m -u 1000 panfm && \
    mkdir -p /app/data && \
    chown -R panfm:panfm /app

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/panfm/.local

# Copy application files
COPY --chown=panfm:panfm app.py .
COPY --chown=panfm:panfm static/ ./static/
COPY --chown=panfm:panfm templates/ ./templates/

# Switch to non-root user
USER panfm

# Add local Python packages to PATH
ENV PATH=/home/panfm/.local/bin:$PATH

# Set Python environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV FLASK_APP=app.py

# Expose Flask default port
EXPOSE 8189

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8189/', timeout=5)" || exit 1

# Run the application
CMD ["python", "app.py"]
