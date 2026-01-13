#!/usr/bin/env bun
/**
 * PAI Arena Web UI
 *
 * Graph-based visualization of DIRECTOR + DOERs orchestration
 */

import { SessionManager } from '../core/Session';
import { Router, RoutedMessage, RouterEvents } from '../core/Router';
import { DirectorDecision } from '../core/Director';

const PORT = parseInt(process.env.ARENA_PORT || '3850');

// SSE clients
let sseClients: Set<ReadableStreamDefaultController> = new Set();

// Active router
let activeRouter: Router | null = null;
let sessionManager: SessionManager | null = null;

/**
 * Broadcast event to all SSE clients
 */
function broadcast(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.enqueue(new TextEncoder().encode(message));
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

/**
 * Router event handlers
 */
const routerEvents: RouterEvents = {
  onMessage: (msg: RoutedMessage) => {
    broadcast('message', msg);
  },
  onAgentStateChange: (agentId: string, status: string) => {
    broadcast('agent-state', { agentId, status });
  },
  onDecision: (decision: DirectorDecision) => {
    broadcast('decision', decision);
  },
  onComplete: (reason: string) => {
    broadcast('complete', { reason });
  },
  onError: (error: string) => {
    broadcast('error', { error });
  },
};

/**
 * HTML page with graph visualization
 */
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PAI Arena</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    .header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { color: #58a6ff; font-size: 1.5rem; }
    .header .status {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #484f58;
    }
    .status-dot.running { background: #3fb950; animation: pulse 2s infinite; }
    .status-dot.paused { background: #d29922; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .main {
      display: grid;
      grid-template-columns: 300px 1fr 350px;
      height: calc(100vh - 60px);
    }
    .sidebar {
      background: #161b22;
      border-right: 1px solid #30363d;
      padding: 1rem;
      overflow-y: auto;
    }
    .sidebar h2 {
      font-size: 0.9rem;
      color: #8b949e;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }
    .mission-input {
      margin-bottom: 1.5rem;
    }
    .mission-input textarea {
      width: 100%;
      height: 80px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      padding: 0.75rem;
      font-size: 0.9rem;
      resize: none;
    }
    .doer-selector {
      margin-bottom: 1.5rem;
    }
    .doer-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #0d1117;
      border-radius: 4px;
      margin-bottom: 0.5rem;
      cursor: pointer;
    }
    .doer-checkbox:hover { background: #21262d; }
    .doer-checkbox input { accent-color: #58a6ff; }
    .budget-input {
      margin-bottom: 1.5rem;
    }
    .budget-input input {
      width: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      padding: 0.75rem;
      font-size: 0.9rem;
    }
    .controls {
      display: flex;
      gap: 0.5rem;
    }
    .btn {
      flex: 1;
      padding: 0.75rem;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #238636;
      color: white;
    }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger {
      background: #da3633;
      color: white;
    }
    .btn-danger:hover { background: #f85149; }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Graph View */
    .graph-container {
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .graph {
      position: relative;
      width: 100%;
      max-width: 600px;
      height: 500px;
    }
    .node {
      position: absolute;
      width: 120px;
      height: 80px;
      background: #21262d;
      border: 2px solid #30363d;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: all 0.3s;
    }
    .node.director {
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      border-color: #f0883e;
      background: #1c1c1c;
    }
    .node.doer { border-color: #58a6ff; }
    .node.active {
      box-shadow: 0 0 20px rgba(88, 166, 255, 0.5);
      border-color: #58a6ff;
    }
    .node.active.director {
      box-shadow: 0 0 20px rgba(240, 136, 62, 0.5);
      border-color: #f0883e;
    }
    .node.waiting { border-color: #d29922; }
    .node.blocked { border-color: #f85149; }
    .node-icon { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .node-name { font-size: 0.8rem; font-weight: 600; }
    .node-status { font-size: 0.7rem; color: #8b949e; }

    /* Edges */
    .edge {
      position: absolute;
      background: #30363d;
      height: 2px;
      transform-origin: left center;
      transition: all 0.3s;
    }
    .edge.active {
      background: #58a6ff;
      height: 3px;
      box-shadow: 0 0 10px rgba(88, 166, 255, 0.5);
    }
    .edge-label {
      position: absolute;
      background: #0d1117;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
      color: #8b949e;
    }

    /* Message Panel */
    .message-panel {
      background: #161b22;
      border-left: 1px solid #30363d;
      display: flex;
      flex-direction: column;
    }
    .message-header {
      padding: 1rem;
      border-bottom: 1px solid #30363d;
    }
    .message-header h2 {
      font-size: 0.9rem;
      color: #8b949e;
      text-transform: uppercase;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    .message {
      background: #0d1117;
      border-radius: 8px;
      padding: 0.75rem;
      margin-bottom: 0.75rem;
      border-left: 3px solid #30363d;
    }
    .message.from-director { border-left-color: #f0883e; }
    .message.from-doer { border-left-color: #58a6ff; }
    .message-header-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-size: 0.8rem;
    }
    .message-from { color: #58a6ff; font-weight: 600; }
    .message-time { color: #484f58; }
    .message-content {
      font-size: 0.85rem;
      line-height: 1.4;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }

    /* Budget bar */
    .budget-bar {
      padding: 1rem;
      border-top: 1px solid #30363d;
    }
    .budget-progress {
      height: 8px;
      background: #21262d;
      border-radius: 4px;
      overflow: hidden;
    }
    .budget-fill {
      height: 100%;
      background: linear-gradient(90deg, #238636, #3fb950);
      transition: width 0.3s;
    }
    .budget-fill.warning { background: linear-gradient(90deg, #9e6a03, #d29922); }
    .budget-fill.danger { background: linear-gradient(90deg, #b62324, #f85149); }
    .budget-text {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      margin-top: 0.5rem;
      color: #8b949e;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PAI Arena</h1>
    <div class="status">
      <div class="status-dot" id="status-dot"></div>
      <span id="status-text">Idle</span>
    </div>
  </div>

  <div class="main">
    <div class="sidebar">
      <div class="mission-input">
        <h2>Mission</h2>
        <textarea id="mission" placeholder="Describe what you want to build..."></textarea>
      </div>

      <div class="doer-selector">
        <h2>Select DOERs</h2>
        <label class="doer-checkbox">
          <input type="checkbox" value="architect" checked> Architect
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="backend" checked> Backend
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="frontend"> Frontend
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="qa"> QA
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="security"> Security
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="docs"> Docs
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="researcher"> Researcher
        </label>
        <label class="doer-checkbox">
          <input type="checkbox" value="refactorer"> Refactorer
        </label>
      </div>

      <div class="budget-input">
        <h2>Turn Budget</h2>
        <input type="number" id="budget" value="100" min="10" max="10000">
      </div>

      <div class="controls">
        <button class="btn btn-primary" id="start-btn" onclick="startMission()">Start</button>
        <button class="btn btn-danger" id="stop-btn" onclick="stopMission()" disabled>Stop</button>
      </div>
    </div>

    <div class="graph-container">
      <div class="graph" id="graph">
        <!-- Nodes will be dynamically created -->
      </div>
    </div>

    <div class="message-panel">
      <div class="message-header">
        <h2>Activity Log</h2>
      </div>
      <div class="messages" id="messages"></div>
      <div class="budget-bar">
        <div class="budget-progress">
          <div class="budget-fill" id="budget-fill" style="width: 0%"></div>
        </div>
        <div class="budget-text">
          <span id="turns-used">0</span>
          <span id="turns-total">/ 100 turns</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    let eventSource = null;
    let turnsUsed = 0;
    let budget = 100;
    let agents = new Map();

    // Connect to SSE
    function connect() {
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        addMessage(msg);
      });

      eventSource.addEventListener('agent-state', (e) => {
        const { agentId, status } = JSON.parse(e.data);
        updateAgentState(agentId, status);
      });

      eventSource.addEventListener('decision', (e) => {
        const decision = JSON.parse(e.data);
        console.log('Decision:', decision);
      });

      eventSource.addEventListener('complete', (e) => {
        const { reason } = JSON.parse(e.data);
        setStatus('completed', 'Complete: ' + reason);
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
      });

      eventSource.addEventListener('error', (e) => {
        const { error } = JSON.parse(e.data);
        addSystemMessage('Error: ' + error);
      });

      eventSource.addEventListener('session', (e) => {
        const session = JSON.parse(e.data);
        initializeGraph(session);
      });
    }

    // Initialize graph with agents
    function initializeGraph(session) {
      const graph = document.getElementById('graph');
      graph.innerHTML = '';
      agents.clear();

      // Create DIRECTOR node
      const directorNode = createNode('director', 'DIRECTOR', 'director');
      graph.appendChild(directorNode);
      agents.set('director', { element: directorNode, status: 'idle' });

      // Create DOER nodes in a circle
      const doerCount = session.doers.length;
      const radius = 180;
      const centerX = 300;
      const centerY = 280;

      session.doers.forEach((doer, i) => {
        const angle = (i / doerCount) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const doerId = 'doer-' + doer;
        const node = createNode(doerId, doer.toUpperCase(), 'doer');
        node.style.left = (x - 60) + 'px';
        node.style.top = (y - 40) + 'px';
        graph.appendChild(node);
        agents.set(doerId, { element: node, status: 'idle' });

        // Create edge to DIRECTOR
        const edge = createEdge('director', doerId);
        graph.appendChild(edge);
      });

      // Update budget display
      budget = session.budget;
      turnsUsed = session.turnsUsed || 0;
      updateBudget();
    }

    // Create a node element
    function createNode(id, name, type) {
      const node = document.createElement('div');
      node.className = 'node ' + type;
      node.id = 'node-' + id;
      node.innerHTML = \`
        <div class="node-icon">\${type === 'director' ? '👔' : '🔧'}</div>
        <div class="node-name">\${name}</div>
        <div class="node-status">idle</div>
      \`;
      return node;
    }

    // Create an edge element
    function createEdge(fromId, toId) {
      const edge = document.createElement('div');
      edge.className = 'edge';
      edge.id = 'edge-' + fromId + '-' + toId;
      // Position will be calculated dynamically
      return edge;
    }

    // Update agent state
    function updateAgentState(agentId, status) {
      const agent = agents.get(agentId);
      if (!agent) return;

      agent.status = status;
      const node = agent.element;
      node.className = 'node ' + (agentId === 'director' ? 'director' : 'doer') + ' ' + status;
      node.querySelector('.node-status').textContent = status;
    }

    // Add message to log
    function addMessage(msg) {
      const container = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'message from-' + (msg.from === 'director' ? 'director' : 'doer');

      const time = new Date(msg.timestamp).toLocaleTimeString();
      const content = msg.content.length > 500
        ? msg.content.slice(0, 500) + '...'
        : msg.content;

      div.innerHTML = \`
        <div class="message-header-info">
          <span class="message-from">\${msg.from} → \${msg.to}</span>
          <span class="message-time">\${time}</span>
        </div>
        <div class="message-content">\${escapeHtml(content)}</div>
      \`;

      container.appendChild(div);
      container.scrollTop = container.scrollHeight;

      // Update turns
      turnsUsed++;
      updateBudget();
    }

    // Add system message
    function addSystemMessage(text) {
      const container = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'message';
      div.innerHTML = \`<div class="message-content" style="color: #8b949e;">\${escapeHtml(text)}</div>\`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    // Update budget display
    function updateBudget() {
      const percent = (turnsUsed / budget) * 100;
      const fill = document.getElementById('budget-fill');
      fill.style.width = percent + '%';
      fill.className = 'budget-fill' + (percent > 80 ? ' danger' : percent > 50 ? ' warning' : '');

      document.getElementById('turns-used').textContent = turnsUsed;
      document.getElementById('turns-total').textContent = '/ ' + budget + ' turns';
    }

    // Set status
    function setStatus(state, text) {
      const dot = document.getElementById('status-dot');
      const statusText = document.getElementById('status-text');
      dot.className = 'status-dot ' + state;
      statusText.textContent = text;
    }

    // Escape HTML
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Start mission
    async function startMission() {
      const mission = document.getElementById('mission').value;
      if (!mission) {
        alert('Please enter a mission');
        return;
      }

      const doers = Array.from(document.querySelectorAll('.doer-checkbox input:checked'))
        .map(cb => cb.value);
      if (doers.length === 0) {
        alert('Please select at least one DOER');
        return;
      }

      budget = parseInt(document.getElementById('budget').value);
      turnsUsed = 0;

      document.getElementById('start-btn').disabled = true;
      document.getElementById('stop-btn').disabled = false;
      setStatus('running', 'Running...');

      try {
        const response = await fetch('/api/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mission, doers, budget })
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error);
        }

        addSystemMessage('Mission started: ' + mission);
      } catch (error) {
        setStatus('', 'Error');
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        alert('Failed to start: ' + error.message);
      }
    }

    // Stop mission
    async function stopMission() {
      try {
        await fetch('/api/stop', { method: 'POST' });
        setStatus('paused', 'Stopped');
        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        addSystemMessage('Mission stopped by user');
      } catch (error) {
        alert('Failed to stop: ' + error.message);
      }
    }

    // Initialize on load
    connect();
  </script>
</body>
</html>`;

/**
 * HTTP server
 */
const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,

  async fetch(req) {
    const url = new URL(req.url);

    // SSE endpoint
    if (url.pathname === '/api/events') {
      const stream = new ReadableStream({
        start(controller) {
          sseClients.add(controller);
          controller.enqueue(new TextEncoder().encode('event: connected\ndata: {}\n\n'));
        },
        cancel() {
          // Client disconnected
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Start mission
    if (url.pathname === '/api/start' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { mission, doers, budget } = body;

        // Create session
        sessionManager = new SessionManager();
        const state = sessionManager.start(mission, doers, budget);

        // Create router
        activeRouter = new Router(sessionManager, routerEvents);
        activeRouter.initialize();

        // Broadcast session info
        broadcast('session', {
          id: state.session.id,
          mission: state.session.mission,
          doers: state.session.doers,
          budget: state.session.budget,
          turnsUsed: 0,
        });

        // Start orchestration (non-blocking)
        activeRouter.start().catch((err) => {
          broadcast('error', { error: err.message });
        });

        return Response.json({ success: true, sessionId: state.session.id });
      } catch (error) {
        return Response.json({ success: false, error: String(error) }, { status: 500 });
      }
    }

    // Stop mission
    if (url.pathname === '/api/stop' && req.method === 'POST') {
      if (activeRouter) {
        activeRouter.stop();
        if (sessionManager) {
          sessionManager.complete('paused');
        }
      }
      return Response.json({ success: true });
    }

    // Sessions list
    if (url.pathname === '/api/sessions') {
      const manager = new SessionManager();
      const sessions = manager.listSessions();
      return Response.json(sessions);
    }

    // Serve HTML
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_PAGE, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    PAI ARENA - WEB UI                         ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Server running at http://localhost:${PORT}`);
console.log('');
