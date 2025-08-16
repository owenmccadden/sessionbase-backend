# Gemini CLI Integration with SessionBase

## Overview

This document outlines the technical details and integration approach for supporting Google's Gemini CLI chat sessions in SessionBase. Our analysis reveals that Gemini CLI sessions can be automatically discovered and integrated seamlessly into SessionBase workflows.

## Gemini CLI Session Storage Technical Details

### File Structure
Gemini CLI stores conversation checkpoints using a predictable directory structure:
```
~/.gemini/tmp/{PROJECT_HASH}/checkpoint-{TAG}.json
```

### Hash Generation
The `PROJECT_HASH` is generated using SHA256 of the absolute project directory path:
```bash
echo -n "/path/to/project" | shasum -a 256
```

**Example:**
- **Project Directory**: `/Users/owen/owenmcdev/sessionbase/frontend`
- **Generated Hash**: `f1f06d556433ff7332fb475cbcac0443b7ef6df64d634db09fc4d7176b5b39f1`
- **Session Path**: `~/.gemini/tmp/f1f06d556433ff7332fb475cbcac0443b7ef6df64d634db09fc4d7176b5b39f1/checkpoint-gemini.json`

### Session Format Structure

Gemini CLI sessions are stored as JSON arrays with the following message types:

#### 1. User Messages
```json
{
  "role": "user",
  "parts": [
    {
      "text": "Can we refactor the UnifiedSessionViewer component?"
    }
  ]
}
```

#### 2. Model Text Responses
```json
{
  "role": "model",
  "parts": [
    {
      "text": "I'll help you refactor that component. Let me first examine the current code."
    }
  ]
}
```

#### 3. Model Function Calls (Tool Usage)
```json
{
  "role": "model",
  "parts": [
    {
      "functionCall": {
        "name": "read_file",
        "args": {
          "absolute_path": "/path/to/file.js"
        }
      }
    }
  ]
}
```

#### 4. Function Responses (Tool Results)
```json
{
  "role": "user",
  "parts": [
    {
      "functionResponse": {
        "id": "read_file-1753394439566-ce2bcbf1a6bb6",
        "name": "read_file",
        "response": {
          "output": "[File content here...]"
        }
      }
    }
  ]
}
```

## Integration Benefits

### Automatic Session Discovery
- **No manual file hunting**: SessionBase can programmatically discover all available Gemini CLI sessions
- **Project context**: Sessions are automatically linked to their source project directories
- **Rich metadata**: Extract working directory, timestamps, and tool usage statistics

### Team Collaboration Features
- **Session sharing**: Teams can share checkpoint files for collaboration
- **Session forking**: Rename files to create conversation branches
- **Cross-team resumption**: Anyone in the same project directory can resume sessions

## SessionBase Integration Points

### 1. SessionBase List Command Enhancement

**Current Behavior**: Lists uploaded sessions from SessionBase API

**Enhanced Behavior**: 
```bash
sessionbase list --include-local-gemini
```

**Implementation Approach**:
```javascript
// Pseudo-code for discovery
const discoverGeminiSessions = async () => {
  const projectCandidates = [
    process.cwd(),
    findGitRoots(),
    getRecentProjectDirs()
  ];
  
  const sessions = [];
  for (const projectPath of projectCandidates) {
    const hash = crypto.createHash('sha256').update(projectPath).digest('hex');
    const geminiDir = path.join(os.homedir(), '.gemini', 'tmp', hash);
    
    try {
      const files = await fs.readdir(geminiDir);
      const checkpoints = files
        .filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'))
        .map(f => ({
          path: path.join(geminiDir, f),
          tag: f.slice(11, -5), // Remove 'checkpoint-' and '.json'
          project: projectPath,
          mtime: fs.statSync(path.join(geminiDir, f)).mtime
        }));
      
      sessions.push(...checkpoints);
    } catch (err) {
      // Directory doesn't exist or is inaccessible
    }
  }
  
  return sessions.sort((a, b) => b.mtime - a.mtime);
};
```

### 2. SessionBase Upload Command Enhancement

**Current Behavior**: Uploads single files to SessionBase

**Enhanced Behavior**:
```bash
# Auto-discover and select from available Gemini CLI sessions
sessionbase upload --discover-gemini

# Upload specific Gemini CLI session by tag
sessionbase upload --gemini-tag my-session

# Upload specific checkpoint file
sessionbase upload ~/.gemini/tmp/{hash}/checkpoint-tag.json
```

**Implementation Requirements**:
- **Format detection**: Auto-detect Gemini CLI JSON format
- **Metadata extraction**: Parse project directory, tool usage, timestamps
- **Session conversion**: Transform to SessionBase internal format

### 3. POST /sessions API Endpoint Enhancement

**Current Payload Structure**: Handles various session formats (Claude Code, Cursor, etc.)

**Enhanced Payload for Gemini CLI**:
```json
{
  "type": "gemini_cli",
  "title": "Refactoring UnifiedSessionViewer",
  "metadata": {
    "projectDirectory": "/Users/owen/owenmcdev/sessionbase/frontend",
    "projectHash": "f1f06d556433ff7332fb475cbcac0443b7ef6df64d634db09fc4d7176b5b39f1",
    "geminiTag": "gemini-test",
    "toolCallsCount": 15,
    "functionsUsed": ["read_file", "write_file", "run_shell_command"],
    "sessionLength": 85,
    "lastModified": "2025-07-24T18:30:00Z"
  },
  "rawData": "[... original Gemini CLI JSON array ...]",
  "messages": "[... converted to SessionBase message format ...]"
}
```

**Backend Processing Requirements**:
```javascript
// Parser for Gemini CLI format
const parseGeminiSession = (rawJson) => {
  const data = JSON.parse(rawJson);
  
  // Extract metadata from first message (context setup)
  const contextMessage = data.find(msg => 
    msg.role === 'user' && 
    msg.parts?.[0]?.text?.includes('context for our chat')
  );
  
  const projectDir = extractProjectDirectory(contextMessage);
  
  // Convert messages to SessionBase format
  const messages = data
    .filter(msg => !isContextSetup(msg))
    .map(convertToSessionBaseMessage);
  
  // Calculate statistics
  const stats = {
    toolCalls: countToolCalls(data),
    functionsUsed: extractFunctionNames(data),
    messageCount: messages.length
  };
  
  return {
    type: 'gemini_cli',
    projectDirectory: projectDir,
    messages,
    stats,
    rawData: rawJson
  };
};
```

## Implementation Phases

### Phase 1: Basic Support
- [ ] **Backend parser**: Add Gemini CLI format detection and conversion
- [ ] **API enhancement**: Extend POST /sessions to handle Gemini CLI format
- [ ] **Manual upload**: Support drag-and-drop of checkpoint files

### Phase 2: Auto-Discovery
- [ ] **Discovery algorithm**: Implement automatic session detection
- [ ] **CLI enhancement**: Add `--discover-gemini` flag to upload command
- [ ] **List integration**: Show local Gemini sessions in `sessionbase list`

### Phase 3: Team Features
- [ ] **Session sharing**: Enable easy checkpoint file sharing
- [ ] **Project linking**: Connect sessions to Git repositories
- [ ] **Advanced metadata**: Rich project context and tool usage analysis

## Technical Considerations

### Performance
- **Large files**: Gemini CLI sessions can exceed 250KB
- **Parsing complexity**: Handle nested function calls and responses efficiently
- **Discovery speed**: Cache project directory hashes for faster lookup

### Security
- **Path validation**: Ensure hash-based paths are legitimate
- **Content sanitization**: Validate JSON structure before processing
- **Access control**: Respect file system permissions

### Compatibility
- **Format evolution**: Handle future changes to Gemini CLI checkpoint format
- **Cross-platform**: Support Windows, macOS, and Linux path structures
- **Version detection**: Identify Gemini CLI version from session metadata

## Expected User Experience

### Developer Workflow
1. **Work in Gemini CLI**: Create checkpoints with `/chat save my-session`
2. **Open SessionBase**: Run `sessionbase list --include-local-gemini`
3. **See available sessions**: Auto-discovered Gemini CLI sessions appear
4. **Upload with one command**: `sessionbase upload --gemini-tag my-session`
5. **Share with team**: Copy checkpoint file or share via SessionBase

### Team Collaboration
1. **Teammate shares checkpoint**: Drops file in project directory
2. **Auto-discovery**: SessionBase automatically detects shared session
3. **Seamless resumption**: Continue conversation where teammate left off
4. **Version control**: Commit important checkpoint files to Git

This integration transforms Gemini CLI from an isolated tool into a collaborative, searchable, and shareable development asset within the SessionBase ecosystem.