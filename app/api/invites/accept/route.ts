import { NextResponse } from "next/server";

import { hashInviteToken } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface AcceptInviteBody {
  token?: string;
}

export async function POST(request: Request) {
  let body: AcceptInviteBody;
  try {
    body = (await request.json()) as AcceptInviteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.token) {
    return NextResponse.json({ error: "`token` required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenHash = hashInviteToken(body.token);

  const { data, error } = await supabase.rpc("accept_company_invite", {
    p_token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ companyId: data });
}
