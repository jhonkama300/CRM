"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchAccountMembers, memberLabel } from "@/lib/account/members";
import {
  extractMentionedUserIds,
  insertMention,
  mentionQueryAt,
  type MentionQuery,
} from "@/lib/inbox/mentions";
import type { AccountMember, ConversationComment } from "@/types";
import { AtSign, Loader2, MessageSquare, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ConversationComments({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const t = useTranslations("Inbox.comments");
  const { accountId, user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [comments, setComments] = useState<ConversationComment[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [body, setBody] = useState("");
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void fetchAccountMembers().then(setMembers);
  }, []);

  const load = useCallback(async () => {
    if (!conversationId) {
      setComments([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("conversation_comments")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("[comments] load failed:", error.message);
    setComments((data ?? []) as ConversationComment[]);
    setLoading(false);
  }, [conversationId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const mentionMatches = mention
    ? members
        .filter((member) => member.user_id !== user?.id)
        .filter((member) =>
          memberLabel(member)
            .toLowerCase()
            .includes(mention.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const chooseMention = (member: AccountMember) => {
    if (!mention) return;
    const next = insertMention(body, mention, member);
    setBody(next.value);
    setMention(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const submit = async () => {
    if (!conversationId || !accountId || !user?.id || !body.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase
        .from("conversation_comments")
        .insert({
          account_id: accountId,
          conversation_id: conversationId,
          user_id: user.id,
          body: body.trim(),
          mentioned_user_ids: extractMentionedUserIds(body, members).filter(
            (id) => id !== user.id,
          ),
        })
        .select()
        .single();
      if (error) {
        toast.error(t("sendFailed"));
        return;
      }
      setComments((prev) => [data as ConversationComment, ...prev]);
      setBody("");
      setMention(null);
    } catch {
      toast.error(t("sendFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="h-3 w-3" />
        {t("title")}
      </div>

      {conversationId && (
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={body}
              onChange={(e) => {
                const value = e.target.value;
                setBody(value);
                setMention(
                  mentionQueryAt(value, e.target.selectionStart ?? value.length),
                );
              }}
              onSelect={(e) => {
                const el = e.currentTarget;
                setMention(mentionQueryAt(body, el.selectionStart ?? body.length));
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMention(null);
              }}
              placeholder={t("placeholder")}
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
            />
            {mention && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {mentionMatches.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseMention(member)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-popover-foreground hover:bg-muted"
                  >
                    <AtSign className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{memberLabel(member)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            size="sm"
            className="h-auto bg-primary px-2 hover:bg-primary/90"
            onClick={() => void submit()}
            disabled={!body.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}

      <div className="mt-2 space-y-2">
        {loading ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="px-1 text-[11px] text-muted-foreground">{t("empty")}</p>
        ) : (
          comments.map((comment) => {
            const author = members.find((m) => m.user_id === comment.user_id);
            return (
              <div key={comment.id} className="rounded-lg bg-muted px-3 py-2">
                <p className="text-[10px] font-medium text-foreground">
                  {author ? memberLabel(author) : t("unknownAuthor")}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {comment.body}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  {formatDistanceToNow(new Date(comment.created_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
