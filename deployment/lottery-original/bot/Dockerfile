FROM python:3.12-alpine
WORKDIR /app
RUN apk add --no-cache git && pip install --no-cache-dir beautifulsoup4==4.13.5
COPY lottery-original/bot/github-runner/sender.py /app/lottery-bot/sender.py
COPY lottery-original/bot/manager.py /app/manager.py
RUN mkdir -p /app/lottery-bot/state /data
ENV PYTHONUNBUFFERED=1 DRY_RUN=1 KQ247_LOTTERY_CUTOVER=disabled
EXPOSE 3005
CMD ["python","manager.py"]
