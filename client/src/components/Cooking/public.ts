type PublicProfileIdentity = {
  id: string;
  name?: string;
  username?: string;
};

function profileSlug(identity: PublicProfileIdentity): string {
  const source = identity.username || identity.name || 'cook';
  return (
    source
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cook'
  );
}

export function publicProfilePath(identity: PublicProfileIdentity): string {
  return `/cooks/${encodeURIComponent(identity.id)}/${profileSlug(identity)}`;
}
