-- Admin-editable copy for /presentation/expired (unauthenticated media landing page).

INSERT INTO public.app_settings (key, value, description) VALUES
  (
    'unauthenticated_media_headline',
    'Unauthenticated Media',
    'Headline on the unauthenticated media page (invalid/expired presentation QR)'
  ),
  (
    'unauthenticated_media_subhead',
    'This content could not be verified.',
    'Subhead on the unauthenticated media page'
  ),
  (
    'unauthenticated_media_body',
    'It may have been photographed, screen-recorded, edited, or shared without the creator''s authorization. SAIVD verifies authenticity at the source — when that link is missing, we can''t confirm who published it.',
    'Body paragraph on the unauthenticated media page'
  ),
  (
    'unauthenticated_media_cta_label',
    'Learn about SAIVD',
    'Primary button label on the unauthenticated media page'
  ),
  (
    'unauthenticated_media_cta_url',
    'https://www.saivd.io/',
    'Primary button URL on the unauthenticated media page (https only)'
  ),
  (
    'unauthenticated_media_tagline',
    'Trace it. Trust it.',
    'Optional footer tagline; leave empty to hide'
  )
ON CONFLICT (key) DO NOTHING;
