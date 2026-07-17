-- Example marketing_destinations rows covering every destination_type.
-- Every row here has last_rules_review_date = null (never manually
-- verified) and a notes field flagging it as seed data -- these are
-- starting points to edit from Settings/Destinations, NOT a claim that
-- these rules are current. Submission URLs point at real homepages where
-- known, but self_promotion_allowed/karma/cooldown fields are left null
-- ("unknown, verify before posting") rather than guessed.
--
-- Safe to run multiple times -- uses "insert ... where not exists" keyed on
-- name rather than "on conflict (name)" so it doesn't depend on whether the
-- unique constraint on marketing_destinations.name has actually reached
-- this database yet (see 20260723_marketing_fixes.sql for that retrofit).

insert into public.marketing_destinations
  (name, platform, community_or_directory_name, destination_type, submission_url, homepage_url,
   posting_method, audience, best_campaign_goals, self_promotion_allowed, manual_review_required,
   api_availability, notes, active)
select * from (values
  ('r/GetStudying', 'reddit', 'r/GetStudying', 'Reddit community', 'https://www.reddit.com/r/GetStudying/submit', 'https://www.reddit.com/r/GetStudying/',
   'manual_submission', 'Students looking for study techniques and tools', array['get_student_users','get_honest_feedback','get_beta_testers'], null, true, false,
   'Seed data -- verify current self-promotion rules in the subreddit wiki before posting.', true),

  ('r/SideProject', 'reddit', 'r/SideProject', 'Reddit community', 'https://www.reddit.com/r/SideProject/submit', 'https://www.reddit.com/r/SideProject/',
   'manual_submission', 'Indie founders and builders', array['get_beta_testers','announce_launch','get_honest_feedback'], null, true, false,
   'Seed data -- verify current self-promotion rules before posting.', true),

  ('r/EdTech', 'reddit', 'r/EdTech', 'Reddit community', 'https://www.reddit.com/r/EdTech/submit', 'https://www.reddit.com/r/EdTech/',
   'manual_submission', 'Educators and edtech builders', array['tutoring_center_interest','school_club_interest','get_honest_feedback'], null, true, false,
   'Seed data -- verify current self-promotion rules before posting.', true),

  ('Indie Hackers', 'founder_community', 'Indie Hackers', 'Founder community', 'https://www.indiehackers.com/post/new', 'https://www.indiehackers.com/',
   'manual_submission', 'Indie founders and bootstrappers', array['announce_launch','get_honest_feedback','grow_social_accounts'], true, true, false,
   'Seed data -- self-promotion is generally welcomed for launches/milestones but verify current posting guidelines.', true),

  ('Product Hunt', 'product_launch_platform', 'Product Hunt', 'Product-launch platform', 'https://www.producthunt.com/posts/new', 'https://www.producthunt.com/',
   'manual_submission', 'Early adopters, tech enthusiasts, founders', array['announce_launch','get_beta_testers'], true, true, false,
   'Seed data -- launches are the explicit purpose of this platform; still verify current submission guidelines (assets, timing, maker comment norms).', true),

  ('BetaList', 'beta_testing_platform', 'BetaList', 'Beta-testing platform', 'https://betalist.com/submit', 'https://betalist.com/',
   'manual_submission', 'Early adopters looking for beta products', array['get_beta_testers','collect_waitlist'], true, true, false,
   'Seed data -- verify current submission requirements and review timeline.', true),

  ('Hacker News (Show HN)', 'startup_directory', 'Show HN', 'Startup directory', 'https://news.ycombinator.com/submit', 'https://news.ycombinator.com/',
   'manual_submission', 'Developers, technical founders', array['announce_launch','get_honest_feedback'], true, true, false,
   'Seed data -- Show HN has specific formatting conventions (title format "Show HN: X – Y"); verify current guidelines before posting.', true),

  ('SaaSHub', 'saas_directory', 'SaaSHub', 'SaaS directory', 'https://www.saashub.com/add', 'https://www.saashub.com/',
   'manual_submission', 'People comparing SaaS tools', array['promote_pro','grow_social_accounts'], true, false, false,
   'Seed data -- directory listing, verify current submission form fields.', true),

  ('There''s An AI For That', 'saas_directory', 'TAAFT', 'SaaS directory', 'https://theresanaiforthat.com/', 'https://theresanaiforthat.com/',
   'manual_submission', 'People discovering AI tools', array['announce_launch','grow_social_accounts'], true, false, false,
   'Seed data -- verify current submission process (may require payment for faster review).', true),

  ('TikTok (organic)', 'tiktok', null, 'Short-form video platform', null, 'https://www.tiktok.com/',
   'copy_and_open', 'Students, Gen Z, study/productivity content viewers', array['grow_social_accounts','promote_ai_battles','get_student_users'], true, false, false,
   'Seed data -- no submission URL (you post directly from your own account). No official posting API used here; always manual.', true),

  ('Instagram Reels (organic)', 'instagram', null, 'Short-form video platform', null, 'https://www.instagram.com/',
   'copy_and_open', 'Students, study-content audience', array['grow_social_accounts','promote_ai_battles'], true, false, false,
   'Seed data -- posted directly from your own account, always manual.', true),

  ('YouTube Shorts (organic)', 'youtube_shorts', null, 'Short-form video platform', null, 'https://www.youtube.com/',
   'copy_and_open', 'Students, study-content audience', array['grow_social_accounts','promote_exam_prep'], true, false, false,
   'Seed data -- posted directly from your own account, always manual.', true),

  ('LinkedIn (personal profile)', 'linkedin', null, 'Professional network', null, 'https://www.linkedin.com/',
   'official_api', 'Founders, edtech professionals, recruiters', array['announce_launch','tutoring_center_interest','grow_social_accounts'], true, false, true,
   'Seed data -- LinkedIn has an official Share API, but this destination stays manual_only until real OAuth credentials are configured (see Settings).', true),

  ('X (personal profile)', 'x', null, 'Microblogging platform', null, 'https://x.com/',
   'official_api', 'Founders, students, edtech/startup Twitter', array['announce_launch','grow_social_accounts','get_honest_feedback'], true, false, true,
   'Seed data -- X has an official API, but this destination stays manual_only until real OAuth credentials are configured (see Settings).', true),

  ('Discord: Indie Devs', 'discord_community', 'Indie Devs', 'Discord community', null, null,
   'manual_submission', 'Indie developers and builders', array['get_beta_testers','get_honest_feedback'], null, true, false,
   'Seed data -- join link/self-promo channel rules vary, verify before posting.', true),

  ('College subreddit (example: r/ApplyingToCollege adjacent study threads)', 'student_community', null, 'Student community', null, null,
   'manual_submission', 'High school and college students', array['get_student_users','school_club_interest'], null, true, false,
   'Seed data -- placeholder; replace with a specific verified community before use.', true),

  ('Local tutoring center outreach (email/newsletter)', 'tutoring_community', null, 'Tutoring community', null, null,
   'manual_submission', 'Tutoring center owners and tutors', array['tutoring_center_interest'], null, true, false,
   'Seed data -- outreach is 1:1, not a public post; treat rules as "always ask permission first."', true),

  ('School club newsletter (example placeholder)', 'newsletter', null, 'Newsletter', null, null,
   'manual_submission', 'Students subscribed to a school/club newsletter', array['school_club_interest','collect_waitlist'], null, true, false,
   'Seed data -- placeholder; replace with a specific verified newsletter contact before use.', true),

  ('r/InternetIsBeautiful', 'forum', 'r/InternetIsBeautiful', 'Forum', 'https://www.reddit.com/r/InternetIsBeautiful/submit', 'https://www.reddit.com/r/InternetIsBeautiful/',
   'manual_submission', 'General Reddit audience interested in useful web tools', array['grow_social_accounts'], false, true, false,
   'Seed data -- this community historically restricts self-promotion heavily; self_promotion_allowed marked false deliberately, re-verify current rules before ever posting here.', true)
) as v (name, platform, community_or_directory_name, destination_type, submission_url, homepage_url,
        posting_method, audience, best_campaign_goals, self_promotion_allowed, manual_review_required,
        api_availability, notes, active)
where not exists (
  select 1 from public.marketing_destinations d where d.name = v.name
);
