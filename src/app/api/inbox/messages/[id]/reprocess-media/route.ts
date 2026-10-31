import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/ai/admin-client";
import { transcribeInboundAudio } from "@/lib/ai/transcribe";
import { decrypt } from "@/lib/whatsapp/encryption";
import { getMediaUrl } from "@/lib/whatsapp/meta-api";
import { mirrorInboundMedia } from "@/lib/whatsapp/mirror-inbound-media";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/inbox/messages/[id]/reprocess-media
 *
 * Retry an inbound attachment that failed to mirror (the inbox showed
 * "audio/photo unavailable"). Requires `messages.meta_media_id`, which
 * the webhook now stores for every new inbound attachment.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole("agent");
    const { id } = await params;

    const { data: message, error: msgErr } = await supabase
      .from("messages")
      .select("id, content_type, media_url, media_type, meta_media_id")
      .eq("id", id)
      .maybeSingle();
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (!message.meta_media_id) {
      return NextResponse.json(
        { error: "This message has no Meta media id to retry" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: config, error: cfgErr } = await admin
      .from("whatsapp_config")
      .select("access_token")
      .eq("account_id", accountId)
      .maybeSingle();
    if (cfgErr || !config?.access_token) {
      return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 400 });
    }

    const accessToken = decrypt(config.access_token as string);
    const mediaId = message.meta_media_id as string;
    const info = await getMediaUrl({ mediaId, accessToken });

    const mirrored = await mirrorInboundMedia({
      storage: admin.storage,
      accountId,
      mediaId,
      downloadUrl: info.url,
      accessToken,
      mimeType: info.mimeType,
      fileSize: info.fileSize,
    });
    const mediaUrl = mirrored ?? `/api/whatsapp/media/${mediaId}`;

    let contentText: string | null = null;
    if (message.content_type === "audio") {
      contentText = await transcribeInboundAudio({
        accountId,
        mediaId,
        accessToken,
        mediaUrl,
        mimeType: info.mimeType,
      });
    }

    const patch: Record<string, unknown> = {
      media_url: mediaUrl,
      media_type: info.mimeType,
    };
    if (contentText) patch.content_text = contentText;

    const { data: updated, error: upErr } = await supabase
      .from("messages")
      .update(patch)
      .eq("id", id)
      .select("id, media_url, media_type, content_text")
      .maybeSingle();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ message: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}
