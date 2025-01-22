#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    PromptMessage
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// Type definitions for various tool arguments
interface CreateProjectArgs extends Record<string, unknown> {
    name: string;
    type: 'react' | 'node' | 'next' | 'express' | 'fastify';
    path: string;
    typescript?: boolean;
}

interface InstallPackageArgs extends Record<string, unknown> {
    packages: string[];
    path: string;
    dev?: boolean;
}

interface RunScriptArgs extends Record<string, unknown> {
    script: string;
    path: string;
}

interface GenerateComponentArgs extends Record<string, unknown> {
    name: string;
    path: string;
    type: 'functional' | 'class';
    props?: Record<string, string>;
}

interface CreateTypeDefinitionArgs extends Record<string, unknown> {
    name: string;
    path: string;
    properties: Record<string, string>;
}

interface AddScriptArgs extends Record<string, unknown> {
    path: string;
    name: string;
    command: string;
}

interface UpdateTsConfigArgs extends Record<string, unknown> {
    path: string;
    options: Record<string, unknown>;
}

interface CreateDocumentationArgs extends Record<string, unknown> {
    path: string;
    type: 'readme' | 'api' | 'component';
    name?: string;
}

/**
 * NodeOmnibusServer class that provides comprehensive tooling for Node.js development
 */
class NodeOmnibusServer {
    private server: Server;
    private projectDocs: Map<string, string>;
    private prompts: Record<string, {
        name: string;
        description: string;
        arguments?: { name: string; description: string; required?: boolean }[];
    }> = {}; // Initialize the property

    constructor() {
        this.server = new Server(
            {
                name: 'node-omnibus-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    resources: {},
                    tools: {},
                    prompts: {}, // Add prompts capability
                },
            }
        );

        this.projectDocs = new Map();
        this.initializePrompts();
        this.setupToolHandlers();
        this.setupResourceHandlers();
        this.setupPromptHandlers();

        this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    private initializePrompts() {
        this.prompts = {
            'create-project': {
                name: 'create-project',
                description: 'Guide through creating a new Node.js project with best practices',
                arguments: [
                    {
                        name: 'projectType',
                        description: 'Type of project to create (react, node, next, express, fastify)',
                        required: true
                    },
                    {
                        name: 'features',
                        description: 'Comma-separated list of features (e.g., typescript,testing,docker)',
                        required: false
                    }
                ]
            },
            'analyze-code': {
                name: 'analyze-code',
                description: 'Analyze code for potential improvements and best practices',
                arguments: [
                    {
                        name: 'code',
                        description: 'Code to analyze',
                        required: true
                    },
                    {
                        name: 'language',
                        description: 'Programming language',
                        required: true
                    }
                ]
            },
            'generate-component': {
                name: 'generate-component',
                description: 'Generate a React component with TypeScript support',
                arguments: [
                    {
                        name: 'name',
                        description: 'Component name',
                        required: true
                    },
                    {
                        name: 'type',
                        description: 'Component type (functional/class)',
                        required: true
                    }
                ]
            },
            'git-commit': {
                name: 'git-commit',
                description: 'Generate a descriptive Git commit message',
                arguments: [
                    {
                        name: 'changes',
                        description: 'Git diff or description of changes',
                        required: true
                    }
                ]
            },
            'debug-error': {
                name: 'debug-error',
                description: 'Get suggestions for debugging a Node.js error',
                arguments: [
                    {
                        name: 'error',
                        description: 'Error message or stack trace',
                        required: true
                    }
                ]
            }
        };
    }

    private setupResourceHandlers() {
        // Handler for listing documentation resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: Array.from(this.projectDocs.entries()).map(([id, content]) => ({
                uri: `docs://${id}`,
                mimeType: 'text/markdown',
                name: `Documentation for ${id}`,
                description: `Project documentation and notes for ${id}`,
            })),
        }));

        // Handler for reading documentation content
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const url = new URL(request.params.uri);
            const id = url.hostname;
            const content = this.projectDocs.get(id);

            if (!content) {
                throw new McpError(ErrorCode.MethodNotFound, `Documentation not found for ${id}`);
            }

            return {
                contents: [{
                    uri: request.params.uri,
                    mimeType: 'text/markdown',
                    text: content,
                }],
            };
        });
    }

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'create_project',
                    description: 'Create a new Node.js project with enhanced configuration',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Project name',
                            },
                            type: {
                                type: 'string',
                                enum: ['react', 'node', 'next', 'express', 'fastify'],
                                description: 'Project type',
                            },
                            path: {
                                type: 'string',
                                description: 'Project directory path',
                            },
                            typescript: {
                                type: 'boolean',
                                description: 'Enable TypeScript support',
                                default: true,
                            },
                        },
                        required: ['name', 'type', 'path'],
                    },
                },
                {
                    name: 'install_packages',
                    description: 'Install npm packages with version management',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            packages: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Package names to install',
                            },
                            path: {
                                type: 'string',
                                description: 'Project directory path',
                            },
                            dev: {
                                type: 'boolean',
                                description: 'Install as dev dependency',
                                default: false,
                            },
                        },
                        required: ['packages', 'path'],
                    },
                },
                {
                    name: 'generate_component',
                    description: 'Generate a new React component with TypeScript support',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Component name',
                            },
                            path: {
                                type: 'string',
                                description: 'Component directory path',
                            },
                            type: {
                                type: 'string',
                                enum: ['functional', 'class'],
                                description: 'Component type',
                            },
                            props: {
                                type: 'object',
                                description: 'Component props with types',
                                additionalProperties: { type: 'string' },
                            },
                        },
                        required: ['name', 'path', 'type'],
                    },
                },
                {
                    name: 'create_type_definition',
                    description: 'Create TypeScript type definitions or interfaces',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description: 'Type name',
                            },
                            path: {
                                type: 'string',
                                description: 'File path',
                            },
                            properties: {
                                type: 'object',
                                description: 'Type properties and their types',
                                additionalProperties: { type: 'string' },
                            },
                        },
                        required: ['name', 'path', 'properties'],
                    },
                },
                {
                    name: 'add_script',
                    description: 'Add a new npm script to package.json',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Project directory path',
                            },
                            name: {
                                type: 'string',
                                description: 'Script name',
                            },
                            command: {
                                type: 'string',
                                description: 'Script command',
                            },
                        },
                        required: ['path', 'name', 'command'],
                    },
                },
                {
                    name: 'update_tsconfig',
                    description: 'Update TypeScript configuration',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Project directory path',
                            },
                            options: {
                                type: 'object',
                                description: 'TypeScript compiler options',
                                additionalProperties: true,
                            },
                        },
                        required: ['path', 'options'],
                    },
                },
                {
                    name: 'create_documentation',
                    description: 'Generate project documentation',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Project directory path',
                            },
                            type: {
                                type: 'string',
                                enum: ['readme', 'api', 'component'],
                                description: 'Documentation type',
                            },
                            name: {
                                type: 'string',
                                description: 'Component or API name for specific documentation',
                            },
                        },
                        required: ['path', 'type'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const args = request.params.arguments as Record<string, unknown>;
                switch (request.params.name) {
                    case 'create_project':
                        return await this.handleCreateProject(args as CreateProjectArgs);
                    case 'install_packages':
                        return await this.handleInstallPackages(args as InstallPackageArgs);
                    case 'generate_component':
                        return await this.handleGenerateComponent(args as GenerateComponentArgs);
                    case 'create_type_definition':
                        return await this.handleCreateTypeDefinition(args as CreateTypeDefinitionArgs);
                    case 'add_script':
                        return await this.handleAddScript(args as AddScriptArgs);
                    case 'update_tsconfig':
                        return await this.handleUpdateTsConfig(args as UpdateTsConfigArgs);
                    case 'create_documentation':
                        return await this.handleCreateDocumentation(args as CreateDocumentationArgs);
                    default:
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            `Unknown tool: ${request.params.name}`
                        );
                }
            } catch (error: unknown) {
                if (error instanceof McpError) throw error;
                throw new McpError(
                    ErrorCode.InternalError,
                    `Error executing ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        });
    }

    private setupPromptHandlers() {
        // List prompts handler with proper schema
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
            prompts: Object.values(this.prompts)
        }));

        // Get prompt handler with proper schema
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            const prompt = this.prompts[name];

            if (!prompt) {
                throw new McpError(ErrorCode.InvalidParams, `Prompt not found: ${name}`);
            }

            // Validate required arguments
            prompt.arguments?.forEach(arg => {
                if (arg.required && !args?.[arg.name]) {
                    throw new McpError(ErrorCode.InvalidParams, `Missing required argument: ${arg.name}`);
                }
            });

            const messages = await this.generatePromptMessages(name, args || {});
            return { messages };
        });
    }

    private async generatePromptMessages(name: string, args: Record<string, string>): Promise<PromptMessage[]> {
        switch (name) {
            case 'create-project':
                const features = args.features?.split(',').map(f => f.trim()) || [];
                return [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Help me create a new ${args.projectType} project with these requirements:

1. Project Type: ${args.projectType}
2. Features: ${features.length > 0 ? features.join(', ') : 'basic setup'}

Please provide:
1. Recommended project structure
2. Essential dependencies to include
3. Important configuration files
4. Best practices for this type of project
5. Common pitfalls to avoid
${features.includes('typescript') ? '6. TypeScript configuration recommendations' : ''}
${features.includes('testing') ? '7. Testing setup and frameworks' : ''}
${features.includes('docker') ? '8. Docker configuration guidance' : ''}`
                        }
                    }
                ];

            case 'analyze-code':
                return [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Please analyze this ${args.language} code for potential improvements and best practices:\n\n${args.code}`
                        }
                    }
                ];

            case 'generate-component':
                return [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Generate a ${args.type} React component named ${args.name} with TypeScript support. Include proper typing, error handling, and common best practices.`
                        }
                    }
                ];

            case 'git-commit':
                return [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Generate a concise but descriptive commit message following conventional commits format for these changes:\n\n${args.changes}`
                        }
                    }
                ];

            case 'debug-error':
                return [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Help me debug this Node.js error. Suggest potential causes and solutions:\n\n${args.error}`
                        }
                    }
                ];

            default:
                throw new McpError(ErrorCode.InvalidParams, `Invalid prompt name: ${name}`);
        }
    }

    /**
     * Validates a path and creates it if it doesn't exist
     * @param path Directory path to validate/create
     * @throws McpError if path is invalid or cannot be created
     */
    // Enhanced error handling for path validation
    private async validatePath(path: string): Promise<void> {
        try {
            // Check if path exists
            try {
                await fs.access(path);
            } catch {
                // If path doesn't exist, create it
                await fs.mkdir(path, { recursive: true });
                return;
            }

            // If path exists, verify it's a directory
            const stats = await fs.stat(path);
            if (!stats.isDirectory()) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    `Path ${path} exists but is not a directory`
                );
            }
        } catch (error) {
            if (error instanceof McpError) throw error;
            throw new McpError(
                ErrorCode.InvalidParams,
                `Failed to validate/create path ${path}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private getProjectTemplate(type: string, name: string, typescript: boolean): {
        command: string;
        dependencies: string[];
        devDependencies: string[];
    } {
        const templates: Record<string, {
            command: string;
            dependencies: string[];
            devDependencies: string[];
        }> = {
            react: {
                command: typescript
                    ? `npx create-react-app ./ --template typescript`
                    : `npx create-react-app ./`,
                dependencies: ['react', 'react-dom'],
                devDependencies: typescript
                    ? ['@types/react', '@types/react-dom', '@types/node']
                    : [],
            },
            next: {
                command: `npx create-next-app@latest ./ ${typescript ? '--typescript' : ''} --tailwind --eslint`,
                dependencies: ['next', 'react', 'react-dom'],
                devDependencies: typescript
                    ? ['@types/node', '@types/react', '@types/react-dom']
                    : [],
            },
            express: {
                command: `npm init -y`,
                dependencies: ['express', 'cors', 'dotenv'],
                devDependencies: typescript
                    ? ['typescript', '@types/node', '@types/express', '@types/cors', 'ts-node', 'nodemon']
                    : ['nodemon'],
            },
            fastify: {
                command: `npm init -y`,
                dependencies: ['fastify', '@fastify/cors', '@fastify/env'],
                devDependencies: typescript
                    ? ['typescript', '@types/node', 'ts-node', 'nodemon']
                    : ['nodemon'],
            },
            node: {
                command: `npm init -y`,
                dependencies: [],
                devDependencies: typescript
                    ? ['typescript', '@types/node', 'ts-node', 'nodemon']
                    : ['nodemon'],
            },
        };

        const template = templates[type];
        if (!template) {
            throw new McpError(ErrorCode.InvalidParams, `Unsupported project type: ${type}`);
        }

        return template;
    }

    private async handleCreateProject(args: CreateProjectArgs) {
        try {
            // Create the project directory first
            const projectPath = path.join(args.path, args.name);
            await fs.mkdir(projectPath, { recursive: true });

            const typescript = args.typescript !== false;
            const template = this.getProjectTemplate(args.type, args.name, typescript);

            // Execute project creation command in the project directory
            const { stdout: createOutput } = await execAsync(template.command, {
                cwd: projectPath
            });

            // Install dependencies directly in the project directory
            if (template.dependencies.length > 0) {
                const installCmd = `npm install ${template.dependencies.join(' ')}`;
                await execAsync(installCmd, { cwd: projectPath });
            }

            // Install dev dependencies
            if (template.devDependencies.length > 0) {
                const installDevCmd = `npm install --save-dev ${template.devDependencies.join(' ')}`;
                await execAsync(installDevCmd, { cwd: projectPath });
            }

            // Setup TypeScript configuration if needed
            if (typescript) {
                const tsConfig = {
                    compilerOptions: {
                        target: "es2020",
                        module: "commonjs",
                        outDir: "./dist",
                        rootDir: "./src",
                        strict: true,
                        esModuleInterop: true,
                        skipLibCheck: true,
                        forceConsistentCasingInFileNames: true,
                        jsx: args.type === 'react' || args.type === 'next' ? "react-jsx" : undefined,
                    },
                    include: ["src/**/*"],
                    exclude: ["node_modules", "dist"]
                };

                await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });
                await fs.writeFile(
                    path.join(projectPath, 'tsconfig.json'),
                    JSON.stringify(tsConfig, null, 2)
                );
            }

            // Create initial documentation
            const readmeContent = this.generateReadme(args.name, args.type, typescript);
            await fs.writeFile(
                path.join(projectPath, 'README.md'),
                readmeContent
            );

            // Store documentation in memory
            this.projectDocs.set(args.name, readmeContent);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Project ${args.name} created successfully with ${typescript ? 'TypeScript' : 'JavaScript'} configuration`,
                    },
                ],
            };
        } catch (error: unknown) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }



    private generateReadme(name: string, type: string, typescript: boolean): string {
        return `# ${name}

## Description
A ${type} project using ${typescript ? 'TypeScript' : 'JavaScript'}.

## Setup
\`\`\`bash
npm install
\`\`\`

## Development
\`\`\`bash
npm run dev
\`\`\`

## Build
\`\`\`bash
npm run build
\`\`\`

## Project Structure
- \`src/\` - Source files
${typescript ? '- `dist/` - Compiled output\n' : ''}
- \`public/\` - Static assets
- \`package.json\` - Project configuration
${typescript ? '- `tsconfig.json` - TypeScript configuration\n' : ''}

## Scripts
- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm start\` - Start production server
`;
    }

    private async handleGenerateComponent(args: GenerateComponentArgs) {
        await this.validatePath(args.path);

        const componentContent = this.generateComponentContent(args);
        const fileName = `${args.name}.tsx`;
        const filePath = path.join(args.path, fileName);

        try {
            await fs.writeFile(filePath, componentContent);

            // Generate component documentation
            const docContent = this.generateComponentDocumentation(args);
            const docPath = path.join(args.path, `${args.name}.md`);
            await fs.writeFile(docPath, docContent);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Component ${args.name} created successfully at ${filePath}`,
                    },
                ],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to generate component: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private generateComponentContent(args: GenerateComponentArgs): string {
        const propsInterface = args.props
            ? `interface ${args.name}Props {
    ${Object.entries(args.props).map(([key, type]) => `${key}: ${type};`).join('\n    ')}
}`
            : '';

        if (args.type === 'functional') {
            return `import React from 'react';

${propsInterface}

${args.props
                    ? `const ${args.name}: React.FC<${args.name}Props> = ({ ${Object.keys(args.props).join(', ')} }) => {`
                    : `const ${args.name}: React.FC = () => {`}
    return (
        <div>
            {/* Add your component content here */}
        </div>
    );
};

export default ${args.name};
`;
        } else {
            return `import React, { Component } from 'react';

${propsInterface}

class ${args.name} extends Component${args.props ? `<${args.name}Props>` : ''} {
    render() {
        return (
            <div>
                {/* Add your component content here */}
            </div>
        );
    }
}

export default ${args.name};
`;
        }
    }

    private generateComponentDocumentation(args: GenerateComponentArgs): string {
        return `# ${args.name} Component

## Overview
${args.type === 'functional' ? 'A functional React component' : 'A class-based React component'}

## Props
${args.props
                ? Object.entries(args.props)
                    .map(([key, type]) => `- \`${key}\`: ${type}`)
                    .join('\n')
                : 'This component does not accept any props.'}

## Usage
\`\`\`tsx
import ${args.name} from './${args.name}';

${args.props
                ? `// Example usage with props
<${args.name} ${Object.entries(args.props)
                    .map(([key, type]) => `${key}={${this.getExampleValue(type)}}`)
                    .join(' ')} />`
                : `// Example usage
<${args.name} />`}
\`\`\`
`;
    }

    private getExampleValue(type: string): string {
        switch (type.toLowerCase()) {
            case 'string':
                return '"example"';
            case 'number':
                return '42';
            case 'boolean':
                return 'true';
            case 'array':
            case 'string[]':
                return '["item1", "item2"]';
            case 'object':
                return '{ key: "value" }';
            default:
                return 'undefined';
        }
    }

    private async handleCreateTypeDefinition(args: CreateTypeDefinitionArgs) {
        await this.validatePath(args.path);

        const typeContent = `export interface ${args.name} {
    ${Object.entries(args.properties)
                .map(([key, type]) => `${key}: ${type};`)
                .join('\n    ')}
}
`;

        const filePath = path.join(args.path, `${args.name}.ts`);

        try {
            await fs.writeFile(filePath, typeContent);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Type definition ${args.name} created successfully at ${filePath}`,
                    },
                ],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to create type definition: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleAddScript(args: AddScriptArgs) {
        await this.validatePath(args.path);

        try {
            const packageJsonPath = path.join(args.path, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            packageJson.scripts[args.name] = args.command;

            await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

            return {
                content: [
                    {
                        type: 'text',
                        text: `Added script '${args.name}': ${args.command}`,
                    },
                ],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to add script: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleUpdateTsConfig(args: UpdateTsConfigArgs) {
        await this.validatePath(args.path);

        try {
            const tsconfigPath = path.join(args.path, 'tsconfig.json');
            interface TsConfig {
                compilerOptions: Record<string, unknown>;
                include?: string[];
                exclude?: string[];
            }
            let tsconfig: TsConfig = {
                compilerOptions: {}
            };

            try {
                tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf-8')) as TsConfig;
            } catch {
                // Create new tsconfig if it doesn't exist
                tsconfig = {
                    compilerOptions: {},
                    include: ["src/**/*"],
                    exclude: ["node_modules", "dist"]
                };
            }

            // Deep merge the new options
            tsconfig.compilerOptions = {
                ...tsconfig.compilerOptions,
                ...args.options,
            };

            await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));

            return {
                content: [
                    {
                        type: 'text',
                        text: `Updated TypeScript configuration at ${tsconfigPath}`,
                    },
                ],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to update TypeScript configuration: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleInstallPackages(args: InstallPackageArgs) {
        await this.validatePath(args.path);

        try {
            // Verify package.json exists
            const packageJsonPath = path.join(args.path, 'package.json');
            await fs.access(packageJsonPath);

            // Install packages
            const installCmd = `npm install ${args.dev ? '--save-dev' : ''} ${args.packages.join(' ')}`;
            const { stdout, stderr } = await execAsync(installCmd, { cwd: args.path });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Packages installed successfully:\n${stdout}\n${stderr}`,
                    },
                ],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to install packages: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleCreateDocumentation(args: CreateDocumentationArgs) {
        await this.validatePath(args.path);

        try {
            let content = '';
            let fileName = '';

            switch (args.type) {
                case 'readme':
                    content = await this.generateProjectDocumentation(args.path);
                    fileName = 'README.md';
                    break;
                case 'api':
                    content = await this.generateApiDocumentation(args.path);
                    fileName = 'API.md';
                    break;
                case 'component':
                    if (!args.name) {
                        throw new McpError(ErrorCode.InvalidParams, 'Component name is required for component documentation');
                    }
                    content = await this.generateComponentDoc(args.path, args.name);
                    fileName = `${args.name}.md`;
                    break;
            }

            const docPath = path.join(args.path, fileName);
            await fs.writeFile(docPath, content);

            // Store in memory for resource access
            this.projectDocs.set(path.basename(args.path), content);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Documentation created successfully at ${docPath}`,
                    },
                ],
            };
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to create documentation: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async generateProjectDocumentation(projectPath: string): Promise<string> {
        const packageJson = JSON.parse(
            await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8')
        );

        return `# ${packageJson.name}

## Description
${packageJson.description || 'A Node.js project'}

## Installation
\`\`\`bash
npm install
\`\`\`

## Scripts
${Object.entries(packageJson.scripts || {})
                .map(([name, command]) => `- \`npm run ${name}\`: ${command}`)
                .join('\n')}

## Dependencies
${Object.entries(packageJson.dependencies || {})
                .map(([name, version]) => `- \`${name}\`: ${version}`)
                .join('\n')}

## Dev Dependencies
${Object.entries(packageJson.devDependencies || {})
                .map(([name, version]) => `- \`${name}\`: ${version}`)
                .join('\n')}
`;
    }

    private async generateApiDocumentation(projectPath: string): Promise<string> {
        // This is a basic implementation. In a real-world scenario,
        // you might want to use a tool like swagger-jsdoc to generate API documentation
        return `# API Documentation

## Endpoints

### GET /api
Description of the GET /api endpoint

### POST /api
Description of the POST /api endpoint

## Models
Description of your data models

## Authentication
Description of your authentication methods
`;
    }

    private async generateComponentDoc(projectPath: string, componentName: string): Promise<string> {
        try {
            const componentPath = path.join(projectPath, `${componentName}.tsx`);
            const componentContent = await fs.readFile(componentPath, 'utf-8');

            // Basic prop extraction - in a real implementation you might want to use
            // a proper TypeScript parser
            const propsMatch = componentContent.match(/interface (\w+)Props {([^}]+)}/);
            const props = propsMatch ? propsMatch[2].trim() : 'No props defined';

            return `# ${componentName} Component

## Props
\`\`\`typescript
${props}
\`\`\`

## Usage
\`\`\`tsx
import ${componentName} from './${componentName}';

// Example usage
<${componentName} />
\`\`\`

## Description
Add component description here.
`;
        } catch (error) {
            throw new McpError(
                ErrorCode.InternalError,
                `Failed to generate component documentation: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Node.js Omnibus MCP server running on stdio');
    }
}

const server = new NodeOmnibusServer();
server.run().catch(console.error);
