# Video Call SDK

TypeScript SDK для создания приложений видеозвонков с использованием WebRTC и mediasoup.

## 🚀 Quick Start

### Docker Setup

```bash
# Start production server (port 3001)
npm run docker:prod

# Run integration tests
npm run docker:test

# Stop all containers
npm run docker:stop
```

### Local Development

```bash
# Install dependencies
npm install

# Start signaling server
npm run start:server

# Run integration tests in the second terminal
npm run dev:test

# Run unit tests 
npm run test

```

## 📁 Структура проекта

```
video-call-sdk/
src/
│   ├── sdk/              # Main SDK
│   │   ├── VideoCallClient.ts   # Main orchestrator
│   │   ├── SignalingChannel.ts  # WebSocket abstraction
│   │   └── managers/            # Specialized managers
│   │       ├── ConnectionManager.ts
│   │       ├── MediaManager.ts
│   │       └── DeviceManager.ts
│   ├── server/           # Signaling server for testing
│   │   ├── signalling-server.ts
│   │   └── server.js
│   ├── utils/            # Utility classes
│   │   ├── EventQueue.ts
│   │   └── TypedEventEmitter.ts
│   └── types/ # TypeScript definitions
├── test/                 # Test suites
│   ├── client-test.ts
│   ├── VideoCallClient.test.ts
│   └── SignalingChannel.test.ts
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose setup
├── PRODUCTION_SCALABILITY.md  
└── PROPOSED_IMPROVEMENTS.md  
```

## 🏗️ Architecture Decisions

### Система очереди событий

Реализует гарантированную последовательную обработку WebRTC операций для предотвращения состояний гонки при создании транспортов и producers.

### Интеграция с TypeScript

Использует продвинутые возможности TypeScript включая generics, conditional types и типизированные event emitters для обеспечения безопасности на этапе компиляции.

### Intelligent Reconnection System

Автоматическое переподключение с сохранением состояния звонка (roomId, userId, активность видео) и exponential backoff для стабильности соединения.

## 📋 Proposed Improvements

**Архитектурные предложения по улучшению SDK находятся в файле `PROPOSED_IMPROVEMENTS.md`**

## 🚀 Production Scalability

**Решения для продакшн масштабирования описаны в `PRODUCTION_SCALABILITY.md`**

## 🛠️ Development

```bash
# Install dependencies
npm install

# Development with file watching
npm run watch:test

# Code formatting
npm run format

# Run all tests
npm run test
```

## 📚 API Reference

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

## 🐳 Docker Configuration

### Development Environment

```bash
# Start development server (runs on port 3002)
npm run docker:dev

# View development logs
npm run docker:logs-dev
```

### Production Environment

```bash
# Build and start production server (runs on port 3001)
npm run docker:prod

# View production logs
npm run docker:logs
```

### Available Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:build` | Build Docker images |
| `npm run docker:dev` | Start development server on port 3002 |
| `npm run docker:prod` | Start production server on port 3001 |
| `npm run docker:test` | Run integration tests with Docker |
| `npm run docker:stop` | Stop all containers |
| `npm run docker:logs` | View production server logs |
| `npm run docker:logs-dev` | View development server logs |
| `npm run docker:clean` | Clean up containers and volumes |

### Troubleshooting

**Container won't start:**
```bash
# Check container logs
npm run docker:logs

# Restart containers
npm run docker:stop
npm run docker:prod
```

**Port conflicts:**
- Production server uses port 3001
- Development server uses port 3002
- Make sure these ports are available
