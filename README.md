# Node Omnibus MCP Server

[![smithery badge](https://smithery.ai/badge/@bsmi021/mcp-node-omnibus-server)](https://smithery.ai/server/@bsmi021/mcp-node-omnibus-server)

A comprehensive Model Context Protocol (MCP) server that provides advanced Node.js development tooling and automation capabilities.

## Features

### Project Management

- **Project Creation**: Scaffold new projects with built-in support for:
  - React
  - Next.js
  - Express
  - Fastify
  - Plain Node.js
- **TypeScript Integration**: Automatic TypeScript configuration and setup
- **Package Management**: Smart dependency installation and version management

### Component Generation

- Create React components (functional or class-based)
- TypeScript interfaces generation
- Automatic prop types definition
- Component documentation generation

### Configuration Management

- TypeScript configuration management
- NPM script management
- Package.json updates
- Environment setup

### Documentation

- Project README generation
- API documentation
- Component documentation
- TypeScript type definitions documentation

### AI-Powered Assistance

- Project creation guidance
- Code analysis and improvements
- Component generation assistance
- Git commit message suggestions
- Error debugging assistance

## Installation

### Installing via Smithery

To install Node Omnibus Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@bsmi021/mcp-node-omnibus-server):

```bash
npx -y @smithery/cli install @bsmi021/mcp-node-omnibus-server --client claude
```

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

## Usage

The server operates using the Model Context Protocol over stdio. It can be integrated with any MCP-compatible client.

### Starting the Server

```bash
npm start
```

### Available Tools

1. `create_project`

   ```typescript
   {
     name: string;
     type: 'react' | 'node' | 'next' | 'express' | 'fastify';
     path: string;
     typescript?: boolean;
   }
   ```

2. `install_packages`

   ```typescript
   {
     packages: string[];
     path: string;
     dev?: boolean;
   }
   ```

3. `generate_component`

   ```typescript
   {
     name: string;
     path: string;
     type: 'functional' | 'class';
     props?: Record<string, string>;
   }
   ```

4. `create_type_definition`

   ```typescript
   {
     name: string;
     path: string;
     properties: Record<string, string>;
   }
   ```

5. `add_script`

   ```typescript
   {
     path: string;
     name: string;
     command: string;
   }
   ```

6. `update_tsconfig`

   ```typescript
   {
     path: string;
     options: Record<string, unknown>;
   }
   ```

7. `create_documentation`

   ```typescript
   {
     path: string;
     type: 'readme' | 'api' | 'component';
     name?: string;
   }
   ```

### Available Prompts

1. `create-project`

   ```typescript
   {
     projectType: string;  // react, node, next, express, fastify
     features?: string;    // comma-separated list of features
   }
   ```

2. `analyze-code`

   ```typescript
   {
     code: string;
     language: string;
   }
   ```

3. `generate-component`

   ```typescript
   {
     name: string;
     type: string;  // functional or class
   }
   ```

4. `git-commit`

   ```typescript
   {
     changes: string;  // Git diff or description of changes
   }
   ```

5. `debug-error`

   ```typescript
   {
     error: string;  // Error message or stack trace
   }
   ```

## Project Structure

```
node-omnibus-server/
├── src/
│   └── index.ts        # Main server implementation
├── dist/               # Compiled JavaScript
├── node_modules/       # Dependencies
├── package.json        # Project configuration
└── tsconfig.json      # TypeScript configuration
```

## Development

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
```

### Development Mode

```bash
npm run dev
```

## Integration

### VSCode Configuration

Add to your VSCode settings:

```json
{
  "mcpServers": {
    "node-omnibus": {
      "command": "node",
      "args": ["path/to/node-omnibus-server/dist/index.js"]
    }
  }
}
```

### Client Usage Example

```typescript
const client = new McpClient();
await client.connect(transport);

// Create a new React project
const result = await client.callTool('create_project', {
  name: 'my-app',
  type: 'react',
  path: './projects',
  typescript: true
});

// Use AI assistance for project setup
const guidance = await client.getPrompt('create-project', {
  projectType: 'react',
  features: 'typescript,testing,docker'
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Requirements

- Node.js >= 14.x
- npm >= 6.x
- TypeScript >= 4.x

## Dependencies

- @modelcontextprotocol/sdk
- axios
- typescript (dev)
