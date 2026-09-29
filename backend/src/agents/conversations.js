const { findAgent } = require('./registry');

const GLOBAL_CONVERSATION = 'global';

const agentConversationId = (username, agentName) => {
  const agent = findAgent(agentName);
  if (!agent) return null;
  return `agent:${encodeURIComponent(username)}:${agent.name.toLowerCase()}`;
};

const getAgentConversation = (conversationId) => {
  const match = /^agent:([^:]+):([a-z0-9_-]+)$/i.exec(String(conversationId || ''));
  if (!match) return null;

  let username;
  try {
    username = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  const agent = findAgent(match[2]);
  return agent && username ? { username, agent } : null;
};

module.exports = { GLOBAL_CONVERSATION, agentConversationId, getAgentConversation };
