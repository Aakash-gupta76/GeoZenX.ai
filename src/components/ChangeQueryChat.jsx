import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageSquare, RotateCcw, Send, Sparkles, User } from 'lucide-react';
import { askChangeQuestion } from '../api';

const SUGGESTIONS = [
  'What does this website do?',
  'Summarize my image analysis',
  'What changed the most?',
  'How did vegetation change?'
];

const makeWelcomeMessage = (hasAnalysis) => ({
  id: 'welcome',
  sender: 'assistant',
  text: hasAnalysis
    ? 'Namaste! Main aapki image analysis ko asaan bhasha mein samjha sakta hoon. Poochhein ki vegetation, water ya kisi aur category mein kya badla.'
    : 'Namaste! Main GeoZenX assistant hoon. Website ke baare mein poochhein, ya do images analyze karne ke baad unmein hue badlav ka simple summary maangein.',
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
});

export default function ChangeQueryChat({ analysisData }) {
  const [messages, setMessages] = useState(() => [makeWelcomeMessage(Boolean(analysisData))]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef(null);
  const hasUserInteraction = useRef(false);

  useEffect(() => {
    setMessages([makeWelcomeMessage(Boolean(analysisData))]);
  }, [analysisData]);

  useEffect(() => {
    if (!chatBottomRef.current) return;
    if (!hasUserInteraction.current && messages.length <= 1 && !isTyping) return;

    chatBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend = inputQuery) => {
    const text = textToSend.trim();
    if (!text || isTyping) return;

    hasUserInteraction.current = true;

    const history = messages
      .filter((message) => message.sender === 'user' || message.sender === 'assistant')
      .slice(-8)
      .map((message) => ({
        role: message.sender,
        content: message.text
      }));
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages((previous) => [
      ...previous,
      { id: `${Date.now()}-user`, sender: 'user', text, timestamp }
    ]);
    setInputQuery('');
    setIsTyping(true);

    try {
      const response = await askChangeQuestion({
        query: text,
        analysis: analysisData,
        conversation: history
      });
      setMessages((previous) => [
        ...previous,
        { ...response, id: `${Date.now()}-assistant` }
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: `${Date.now()}-error`,
          sender: 'assistant',
          text: `I couldn't send that message. Please try again. (${error.message})`,
          badge: 'CONNECTION ERROR',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearConversation = () => {
    if (isTyping) return;
    setMessages([makeWelcomeMessage(Boolean(analysisData))]);
  };

  return (
    <section id="assistant" className="max-w-6xl mx-auto px-4 py-6">
      <div className="workspace-card chat-card relative p-5 sm:p-7">
        <div className="chat-heading mb-5 flex flex-col gap-4 border-b border-space-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="chat-heading-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white font-sans">GeoZenX Assistant</h2>
                <span className="chat-powered-badge rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]">
                  <Sparkles className="mr-1 inline h-3 w-3" /> Here to help
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Ask how the website works or get a plain-language explanation of your results.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearConversation}
            disabled={isTyping}
            className="chat-reset inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Start a new conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSendMessage(suggestion)}
              disabled={isTyping}
              className="chat-suggestion rounded-full border px-3.5 py-2 text-left text-[11px] font-medium text-slate-300 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div
          className="chat-window relative mb-4 flex h-[360px] flex-col gap-4 overflow-y-auto rounded-2xl border p-4 sm:p-5"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messages.map((message) => {
            const isUser = message.sender === 'user';
            return (
              <div
                key={message.id}
                className={`chat-message flex items-end gap-2.5 sm:gap-3 ${isUser ? 'chat-message-user ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`chat-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isUser ? 'chat-avatar-user' : 'chat-avatar-assistant'}`}>
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={`chat-bubble max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${isUser ? 'text-[#c7dcff]' : 'text-[#9ce8cb]'}`}>
                      {isUser ? 'You' : 'GeoZenX assistant'}
                    </span>
                    {message.timestamp && <span className="text-[10px] text-slate-500">{message.timestamp}</span>}
                    {message.badge && <span className="chat-message-badge ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold">{message.badge}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-200">{message.text}</p>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="chat-message flex items-end gap-3">
              <div className="chat-avatar chat-avatar-assistant flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
                <Bot className="h-4 w-4" />
              </div>
              <div className="chat-bubble chat-bubble-assistant flex items-center gap-3 rounded-2xl px-4 py-3">
                <span className="text-xs text-slate-400">Thinking…</span>
                <span className="typing-dots flex items-center gap-1" aria-label="Assistant is typing"><i /><i /><i /></span>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSendMessage();
          }}
          className="chat-composer flex items-center gap-2 rounded-2xl border p-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(event) => setInputQuery(event.target.value)}
            aria-label="Message the GeoZenX assistant"
            placeholder="Type a message…"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isTyping}
            aria-label="Send message"
            className={`chat-send flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition ${inputQuery.trim() && !isTyping ? 'chat-send-active' : 'chat-send-disabled'}`}
          >
            <span className="hidden sm:inline">Send</span>
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          Answers use the current analysis when available. Land-cover categories are approximate visual estimates.
        </p>
      </div>
    </section>
  );
}
