FROM python:3.12-alpine
RUN adduser -D -u 10001 app
WORKDIR /app
COPY app.py /app/app.py
ENV PYTHONUNBUFFERED=1
USER app
EXPOSE 8080
CMD ["python", "-u", "app.py"]
