-- Junction table: opportunities <-> startup_comments
create table opportunity_startup_comments (
  opportunity_id uuid not null,
  startup_comment_id uuid not null,

  constraint pk_opp_startup_comments primary key (opportunity_id, startup_comment_id),
  constraint fk_opp_startup_comments_opportunity foreign key (opportunity_id) references opportunities(id) on delete cascade,
  constraint fk_opp_startup_comments_comment foreign key (startup_comment_id) references startup_comments(id) on delete cascade
);

create index idx_opp_startup_comments_comment on opportunity_startup_comments(startup_comment_id);
