FROM python:3.11-slim

# Create user with UID 1000 for Hugging Face container permissions
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Install dependencies
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY --chown=user:user . .

# Hugging Face Spaces exposes port 7860
EXPOSE 7860

CMD ["python", "app.py"]
