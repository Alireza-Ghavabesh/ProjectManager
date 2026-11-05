import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Project, ChatMessage } from '../types';
import { api } from '../services/api';
import { 
  MessageSquare, 
  Send, 
  Users, 
  User as UserIcon, 
  Paperclip, 
  Clock, 
  Building2, 
  Sparkles,
  Search,
  AtSign,
  Bell,
  CheckCircle2,
  Filter
} from 'lucide-react';

interface CouncilChatProps {
  currentUser: User;
  users: User[];
  projects: Project[];
}

export const CouncilChat: React.FC<CouncilChatProps> = ({
  currentUser,
  users,
  projects,
}) => {
  const [chatType, setChatType] = useState<'group' | 'direct'>('group');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(
    users.find((u) => u.id !== currentUser.id)?.id || ''
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyMyMentions, setOnlyMyMentions] = useState(false);

  // Mention State
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionCursorIndex, setMentionCursorIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load messages
  const fetchMessages = async () => {
    try {
      if (chatType === 'group') {
        const msgs = await api.getMessages(true);
        setMessages(msgs);
      } else if (selectedPartnerId) {
        const msgs = await api.getMessages(false, selectedPartnerId);
        setMessages(msgs);
      }
    } catch (err) {
      console.error('Error fetching chat messages:', err);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3500);
    return () => clearInterval(interval);
  }, [chatType, selectedPartnerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mention users matching current query
  const filteredMentionUsers = useMemo(() => {
    const q = mentionQuery.toLowerCase().trim();
    return users.filter((u) => {
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.positionTitle && u.positionTitle.toLowerCase().includes(q))
      );
    });
  }, [users, mentionQuery]);

  // Check if a message mentions current user
  const isCurrentUserMentioned = (content: string) => {
    const lower = content.toLowerCase();
    const usernameTag = `@${currentUser.username.toLowerCase()}`;
    const nameTag = `@${currentUser.name.toLowerCase()}`;
    return lower.includes(usernameTag) || lower.includes(nameTag);
  };

  // Count total mentions for current user in current chat
  const myMentionsCount = useMemo(() => {
    return messages.filter((m) => isCurrentUserMentioned(m.content) && m.senderId !== currentUser.id).length;
  }, [messages, currentUser]);

  // Messages to display
  const displayedMessages = useMemo(() => {
    if (!onlyMyMentions || chatType !== 'group') return messages;
    return messages.filter((m) => isCurrentUserMentioned(m.content));
  }, [messages, onlyMyMentions, chatType, currentUser]);

  // Handle text change with @ detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);

    const cursorPos = e.target.selectionStart || text.length;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const charBeforeAt = lastAtPos > 0 ? textBeforeCursor[lastAtPos - 1] : ' ';
      // Check if preceded by space or start of string
      if (/\s/.test(charBeforeAt) || lastAtPos === 0) {
        const query = textBeforeCursor.slice(lastAtPos + 1);
        // Only trigger if no newline and reasonable length
        if (!query.includes('\n') && query.length <= 25) {
          setMentionQuery(query);
          setShowMentionPopup(true);
          setMentionCursorIndex(lastAtPos);
          setSelectedMentionIndex(0);
          return;
        }
      }
    }
    setShowMentionPopup(false);
  };

  const insertMention = (targetUser: User) => {
    const beforeAt = inputText.slice(0, mentionCursorIndex);
    const afterCursor = inputText.slice(mentionCursorIndex + mentionQuery.length + 1);
    // Prefer tagging with @username for deterministic matching
    const mentionTag = `@${targetUser.username} `;
    const updated = beforeAt + mentionTag + afterCursor;

    setInputText(updated);
    setShowMentionPopup(false);
    setMentionQuery('');

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nextPos = beforeAt.length + mentionTag.length;
        inputRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionPopup && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % filteredMentionUsers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentionUsers[selectedMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionPopup(false);
        return;
      }
    }
  };

  const triggerMentionPrompt = () => {
    setInputText((prev) => {
      const trimmed = prev.trim();
      const separator = trimmed.length > 0 ? ' ' : '';
      return prev + separator + '@';
    });
    setShowMentionPopup(true);
    setMentionQuery('');
    setMentionCursorIndex(inputText.length + (inputText.trim().length > 0 ? 1 : 0));
    setSelectedMentionIndex(0);
    inputRef.current?.focus();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setSending(true);
    setShowMentionPopup(false);
    try {
      await api.sendMessage({
        content: inputText.trim(),
        isGroup: chatType === 'group',
        receiverId: chatType === 'direct' ? selectedPartnerId : undefined,
        projectId: selectedProjectId || undefined,
      });

      setInputText('');
      setSelectedProjectId('');
      await fetchMessages();
    } catch (err: any) {
      alert(err.message || 'خطا در ارسال پیام');
    } finally {
      setSending(false);
    }
  };

  // Helper to render message content with rich mention pills
  const renderMessageContent = (content: string, isMine: boolean) => {
    // Regex matches words starting with @
    const tokens = content.split(/(\s+)/);

    return tokens.map((token, index) => {
      if (token.startsWith('@') && token.length > 1) {
        // Clean off trailing punctuation
        const rawKey = token.slice(1).replace(/[.,;:!?]+$/, '');
        const trailingPunctuation = token.slice(1 + rawKey.length);

        const matched = users.find(
          (u) =>
            u.username.toLowerCase() === rawKey.toLowerCase() ||
            u.name.toLowerCase() === rawKey.toLowerCase()
        );

        if (matched) {
          const isMe = matched.id === currentUser.id;
          return (
            <React.Fragment key={index}>
              <span
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold transition shadow-2xs mx-0.5 ${
                  isMine
                    ? 'bg-white/25 text-white border border-white/40'
                    : isMe
                    ? 'bg-amber-200/90 text-amber-950 font-extrabold border border-amber-400 ring-2 ring-amber-300/60'
                    : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                }`}
                title={`عضو شورا: ${matched.name} (${matched.positionTitle || 'بدون سمت'})`}
              >
                <AtSign className="w-3 h-3 opacity-75 shrink-0" />
                <span>{matched.name}</span>
              </span>
              {trailingPunctuation}
            </React.Fragment>
          );
        }
      }
      return <React.Fragment key={index}>{token}</React.Fragment>;
    });
  };

  const selectedPartner = users.find((u) => u.id === selectedPartnerId);
  const directPartners = users.filter((u) => u.id !== currentUser.id && (
    !searchTerm || u.name.toLowerCase().includes(searchTerm.toLowerCase()) || (u.positionTitle && u.positionTitle.toLowerCase().includes(searchTerm.toLowerCase()))
  ));

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[740px] text-slate-800 relative">
      
      {/* Top Chat Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center shrink-0">
            {chatType === 'group' ? <Users className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              {chatType === 'group' ? (
                <>
                  <span>تالار گفتگوی عمومی شورا</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                    {users.length} عضو فعال
                  </span>
                </>
              ) : (
                <>
                  <span>پی‌وی و گفتگوی خصوصی با:</span>
                  <span className="text-indigo-600 font-bold">
                    {selectedPartner ? selectedPartner.name : 'انتخاب کاربر'}
                  </span>
                  {selectedPartner?.positionTitle && (
                    <span className="text-[11px] text-slate-500">
                      ({selectedPartner.positionTitle})
                    </span>
                  )}
                </>
              )}
            </h3>
            <p className="text-[11px] text-slate-500">
              {chatType === 'group'
                ? 'محل تبادل نظر و هم‌اندیشی اعضای شورا (امکان تگ کردن اعضا با @ نام یا نام کاربری)'
                : 'مکالمه مستقیم و محرمانه دو نفره بین شما و عضو منتخب شورا'}
            </p>
          </div>
        </div>

        {/* Right side controls: Filter mentions + Chat Type Switcher */}
        <div className="flex items-center gap-2">
          {chatType === 'group' && (
            <button
              onClick={() => setOnlyMyMentions(!onlyMyMentions)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                onlyMyMentions
                  ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title="فیلتر پیام‌هایی که شما در آن‌ها منشن یا تگ شده‌اید"
            >
              <AtSign className="w-3.5 h-3.5 text-amber-600" />
              <span>منشن‌های من</span>
              {myMentionsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-extrabold">
                  {myMentionsCount}
                </span>
              )}
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              onClick={() => {
                setChatType('group');
                setOnlyMyMentions(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                chatType === 'group'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>چت گروهی</span>
            </button>
            <button
              onClick={() => {
                setChatType('direct');
                setOnlyMyMentions(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                chatType === 'direct'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>پی‌وی (خصوصی)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Chat Body */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Direct Chat Members Sidebar (Visible if Direct Mode) */}
        {chatType === 'direct' && (
          <div className="w-64 sm:w-72 border-l border-slate-200 bg-slate-50/50 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <input
                  type="text"
                  placeholder="جستجوی همکار در شورا..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl bg-white border border-slate-200 px-3 py-1.5 pr-8 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {directPartners.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedPartnerId(u.id)}
                  className={`w-full text-right p-2.5 rounded-xl text-xs transition flex items-center gap-2.5 cursor-pointer ${
                    selectedPartnerId === u.id
                      ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold'
                      : 'hover:bg-slate-100/70 text-slate-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                      <span>{u.name}</span>
                      {u.role === 'ADMIN' && (
                        <span className="text-[9px] px-1 bg-amber-100 text-amber-800 rounded font-bold">مدیر</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate font-normal">
                      {u.positionTitle || 'عضو شورا'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 flex flex-col bg-slate-50/40 relative">
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {displayedMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
                <span>
                  {onlyMyMentions
                    ? 'پیامی که شما در آن تگ شده باشید یافت نشد.'
                    : 'هنوز پیامی در این گفتگو ثبت نشده است.'}
                </span>
                <span className="text-[11px] text-slate-500 mt-1">
                  با تایپ علامت @ می‌توانید همکاران را خطاب قرار دهید.
                </span>
              </div>
            ) : (
              displayedMessages.map((m) => {
                const isMine = m.senderId === currentUser.id;
                const isTagged = isCurrentUserMentioned(m.content) && !isMine;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500">
                      <span className="font-bold text-slate-700">
                        {isMine ? 'شما' : m.senderName}
                      </span>
                      {m.senderPosition && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-indigo-700 border border-slate-200">
                          {m.senderPosition}
                        </span>
                      )}
                      <span>•</span>
                      <span>{new Date(m.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div
                      className={`max-w-[85%] sm:max-w-md p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed relative ${
                        isMine
                          ? 'bg-indigo-600 text-white rounded-br-sm shadow-sm'
                          : isTagged
                          ? 'bg-amber-50/90 border-2 border-amber-400 text-slate-900 rounded-bl-sm shadow-md'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-2xs'
                      }`}
                    >
                      {/* Tagged Alert Banner if current user was mentioned */}
                      {isTagged && (
                        <div className="mb-2 p-1 px-2 rounded-lg bg-amber-200/80 text-amber-950 font-bold text-[10px] flex items-center gap-1 border border-amber-300">
                          <AtSign className="w-3 h-3 text-amber-800 shrink-0" />
                          <span>شما در این پیام خطاب قرار گرفته‌اید</span>
                        </div>
                      )}

                      {/* Attached Project Mention if any */}
                      {m.projectTitle && (
                        <div className={`mb-2 p-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                          isMine ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-50 text-indigo-700 border border-slate-200'
                        }`}>
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span>پروژه: {m.projectTitle}</span>
                        </div>
                      )}

                      <div className="whitespace-pre-wrap">
                        {renderMessageContent(m.content, isMine)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Autocomplete Mention Popover */}
          {showMentionPopup && (
            <div className="absolute bottom-24 right-4 left-4 sm:right-6 sm:left-auto sm:w-80 bg-white rounded-2xl border border-indigo-200 shadow-xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="p-2.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-xs">
                <span className="font-bold text-indigo-900 flex items-center gap-1">
                  <AtSign className="w-3.5 h-3.5 text-indigo-600" />
                  <span>تگ کردن عضو شورا</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {filteredMentionUsers.length} نفر
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto p-1.5 space-y-1">
                {filteredMentionUsers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">
                    کاربری با مشخصات «{mentionQuery}» یافت نشد.
                  </div>
                ) : (
                  filteredMentionUsers.map((u, idx) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u)}
                      className={`w-full text-right p-2 rounded-xl text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                        idx === selectedMentionIndex
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            idx === selectedMentionIndex
                              ? 'bg-white/20 text-white'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {u.name.charAt(0)}
                        </div>
                        <div className="truncate">
                          <div className="truncate">{u.name}</div>
                          <div
                            className={`text-[10px] truncate ${
                              idx === selectedMentionIndex ? 'text-indigo-100' : 'text-slate-400'
                            }`}
                          >
                            @{u.username} {u.positionTitle ? `• ${u.positionTitle}` : ''}
                          </div>
                        </div>
                      </div>

                      {u.role === 'ADMIN' && (
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                            idx === selectedMentionIndex
                              ? 'bg-white/20 text-white'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          مدیر
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Chat Input Box */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 sm:p-4 border-t border-slate-100 bg-white flex flex-col gap-2 relative"
          >
            {/* Toolbar: Project Tagging + Quick @ Mention Button */}
            <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Paperclip className="w-3 h-3 text-indigo-600" />
                  پروژه:
                </span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-indigo-700 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-xs truncate shadow-2xs"
                >
                  <option value="">-- بدون انتساب پروژه --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={triggerMentionPrompt}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer border border-indigo-200 shadow-2xs"
                title="تگ کردن فرد در پیام"
              >
                <AtSign className="w-3.5 h-3.5" />
                <span>تگ کردن فرد (@)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  chatType === 'group'
                    ? 'پیام خود را بنویسید (برای تگ کردن از @ استفاده فرمایید)...'
                    : `ارسال پیام خصوصی به ${selectedPartner?.name || 'همکار'}...`
                }
                className="flex-1 rounded-2xl bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="px-4 sm:px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">ارسال</span>
              </button>
            </div>
          </form>

        </div>

      </div>

    </div>
  );
};
