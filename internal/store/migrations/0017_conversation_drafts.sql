-- The post and the article a conversation is about, so the studio can show both beside the chat.
-- Empty means none.
ALTER TABLE conversations ADD COLUMN post_draft_id    TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN article_draft_id TEXT NOT NULL DEFAULT '';

-- conversations that already have approved proposals are linked to the latest draft of each kind
UPDATE conversations SET post_draft_id = COALESCE((
  SELECT p.draft_id FROM proposals p JOIN drafts d ON d.id = p.draft_id AND d.profile_id = conversations.profile_id
  WHERE p.conversation_id = conversations.id AND p.status = 'approved' AND d.kind = 'post'
  ORDER BY p.decided_at DESC, p.id LIMIT 1), '');
UPDATE conversations SET article_draft_id = COALESCE((
  SELECT p.draft_id FROM proposals p JOIN drafts d ON d.id = p.draft_id AND d.profile_id = conversations.profile_id
  WHERE p.conversation_id = conversations.id AND p.status = 'approved' AND d.kind = 'article'
  ORDER BY p.decided_at DESC, p.id LIMIT 1), '');
