# Lemonade DevContainer

This DevContainer provides a complete development environment for the Lemonade AI-EHR Integration project.

## What's Included

### Base Environment
- **Node.js 20** (LTS) with TypeScript
- **pnpm** - Fast, disk space efficient package manager
- **Docker-in-Docker** - Run Docker and Docker Compose inside the container
- **Git** with zsh and Oh My Zsh

### VS Code Extensions
- ESLint & Prettier for code formatting
- Docker support
- MongoDB tools
- Playwright testing support
- Vitest test explorer
- Path IntelliSense
- Error Lens for inline error display

### Forwarded Ports
- **3000** - Backend API (Express server)
- **27017** - MongoDB

## Getting Started

1. Open this project in VS Code
2. When prompted, click "Reopen in Container"
3. Wait for the container to build and start
4. Install dependencies: `pnpm install`
5. Run tests: `pnpm test`

## Running the Stack

The DevContainer has Docker-in-Docker enabled, so you can run Docker Compose as normal:

```bash
# Start the full stack
docker compose up -d

# Check running containers
docker ps

# View logs
docker compose logs -f

# Stop the stack
docker compose down
```

## Testing

Run tests with the appropriate command based on your setup:

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/backend.spec.ts

# Run Playwright tests
pnpm test:e2e
```

## MongoDB Access

MongoDB will be available at:
- Inside container: `mongodb://localhost:27017`
- From host machine: Check forwarded port in VS Code Ports panel

You can use the MongoDB VS Code extension to connect and browse data.

## Troubleshooting

### Docker Socket Permission Issues
If you encounter permission issues with Docker, the container is configured to use the host's Docker socket with proper permissions.

### Port Already in Use
If ports 3000 or 27017 are already in use on your host:
1. Stop the conflicting service
2. Or modify the port mappings in `docker-compose.yml`

### pnpm Not Found
The `postCreateCommand` should install pnpm globally. If it's missing, run:
```bash
npm install -g pnpm
```
