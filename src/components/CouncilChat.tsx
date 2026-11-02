import React, { useState, useEffect, useRef } from 'react';
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
  Search
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setSending(true);
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

  const selectedPartner = users.find((u) => u.id === selectedPartnerId);
  const directPartners = users.filter((u) => u.id !== currentUser.id && (
    !searchTerm || u.name.toLowerCase().includes(searchTerm.toLowerCase()) || (u.positionTitle && u.positionTitle.toLowerCase().includes(searchTerm.toLowerCase()))
  ));

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[700px] text-slate-800">
      
      {/* Top Chat Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center">
            {chatType === 'group' ? <Users className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
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
                    <span className="text-[10px] text-slate-500">
                      ({selectedPartner.positionTitle})
                    </span>
                  )}
                </>
              )}
            </h3>
            <p className="text-[11px] text-slate-500">
              {chatType === 'group'
                ? 'محل تبادل نظر و هم‌اندیشی اعضای شورا و مدیر جلسه پیرامون پروژه‌ها'
                : 'مکالمه مستقیم و محرمانه دو نفره بین شما و عضو منتخب شورا'}
            </p>
          </div>
        </div>

        {/* Chat Type Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button
            onClick={() => setChatType('group')}
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
            onClick={() => setChatType('direct')}
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
        <div className="flex-1 flex flex-col bg-slate-50/40">
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
                <span>هنوز پیامی در این گفتگو ثبت نشده است.</span>
                <span className="text-[11px] text-slate-500 mt-1">اولین پیام را بنویسید!</span>
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.senderId === currentUser.id;
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
                      className={`max-w-[85%] sm:max-w-md p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        isMine
                          ? 'bg-indigo-600 text-white rounded-br-sm shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-2xs'
                      }`}
                    >
                      {/* Attached Project Mention if any */}
                      {m.projectTitle && (
                        <div className={`mb-2 p-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                          isMine ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-50 text-indigo-700 border border-slate-200'
                        }`}>
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span>پروژه: {m.projectTitle}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 sm:p-4 border-t border-slate-100 bg-white flex flex-col gap-2"
          >
            {/* Project Tagging Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Paperclip className="w-3 h-3 text-indigo-600" />
                ارجاع به پروژه (اختیاری):
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

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  chatType === 'group'
                    ? 'پیام خود را در تالار شورا مطرح فرمایید...'
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
