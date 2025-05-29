# Video Call SDK

TypeScript SDK для создания приложений видеозвонков с использованием WebRTC и mediasoup.

## Quick Start

```bash
# Установка зависимостей
npm install

# Запуск сигнального сервера
npm run start:server

# Запуск интеграционных тестов
npm run dev:test

# Запуск unit-тестов
npm run test:watch
```

## API Reference

### VideoCallClient

**Methods:**

- `joinCall(roomId: string, userId: string): Promise<void>` - Подключение к комнате видеозвонка
- `leaveCall(): Promise<void>` - Выход из звонка с cleanup ресурсов
- `startVideo(): Promise<void>` - Запуск захвата и трансляции видео
- `stopVideo(): Promise<void>` - Остановка трансляции видео
- `on(event, handler)` - Подписка на события (типизированно)
- `off(event, handler)` - Отписка от событий

**Properties:**

- `connectionStatus` - Текущий статус подключения и устройства
- `remoteVideoTracks` - Map с видеодорожками удаленных участников
- `isReady` - Готовность SDK к медиа-операциям

**Events:**

- `connected` - Установлено WebSocket подключение
- `disconnected` - Потеряно WebSocket подключение
- `joined` - Успешное подключение к комнате
- `deviceReady` - Mediasoup устройство инициализировано
- `reconnecting` - Начато переподключение
- `reconnected` - Переподключение успешно
- `localVideoStarted` - Запущена трансляция локального видео
- `remoteVideoStarted` - Доступно видео удаленного участника
- `participantJoined` - Новый участник присоединился к комнате
- `error` - Произошла ошибка

### CallStore (MobX)

**Observable State:**

- `callState: CallState` - Текущее состояние звонка
- `participants: Map<string, Participant>` - Участники звонка
- `connectionStatus: ConnectionStatus` - Статус подключения

**Computed Values:**

- `isConnected: boolean` - Статус соединения
- `isInCall: boolean` - В звонке ли пользователь
- `canStartVideo: boolean` - Можно ли запустить видео
- `participantList: Participant[]` - Список участников
- `callMetrics: CallMetrics` - Метрики качества звонка

**Actions:**

- `initializeClient(serverUrl: string)` - Инициализация клиента
- `joinCall(roomId: string, userId: string)` - Присоединение к звонку
- `leaveCall()` - Покинуть звонок
- `startVideo()` - Запустить видео
- `stopVideo()` - Остановить видео

## Architecture Decisions

### Система очереди событий

Реализует гарантированную последовательную обработку WebRTC операций для предотвращения состояний гонки при создании транспортов и producers.

### Интеграция с TypeScript

Использует продвинутые возможности TypeScript включая generics, conditional types и типизированные event emitters для обеспечения безопасности на этапе компиляции.

### Intelligent Reconnection System

Автоматическое переподключение с сохранением состояния звонка (roomId, userId, активность видео) и exponential backoff для стабильности соединения.

## Proposed Improvements

**Архитектурные предложения по улучшению SDK находятся в файле `PROPOSED_IMPROVEMENTS.md`**

## Production Scalability

**Решения для продакшн масштабирования описаны в `PRODUCTION_SCALABILITY.md`**

## Docker Setup

### Разработка

```bash
# Запуск сигнального сервера
docker-compose up

# Или сборка и запуск вручную
docker build -t video-call-server .
docker run -p 3001:3001 video-call-server
```

### Продакшн развертывание

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  signaling-cluster:
    image: video-call-server:latest
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
```

## Структура проекта

```
video-call-sdk/
├── src/
│   ├── sdk/              # Основные компоненты SDK
│   │   ├── VideoCallClient.ts
│   │   └── SignalingChannel.ts
│   ├── server/             Сигнальный сервер
│   │   ├── signalling-server.js
│   │   └── server.ts
│   ├── utils/            # Утилиты
│   │   ├── EventQueue.ts
│   │   └── TypedEventEmitter.ts
│   └── types/            # TypeScript определения
│       └── events.ts
├── test/                 # Тесты
│   ├── client-test.ts
│   ├── VideoCallClient.test.ts
│   └── SignalingChannel.test.ts
├── PRODUCTION_SCALABILITY.md  
└── PROPOSED_IMPROVEMENTS.md  
```

## Development

```bash
# Установка зависимостей
npm install

# Разработка с отслеживанием файлов
npm run watch:test

# Форматирование кода
npm run format

# Запуск всех тестов
npm run test
```
