-- Task 15: when a contact's phone matches a registered profile's phone, link the
-- contact to that user so monitoring pushes reach their app.

create or replace function link_contact_to_profile() returns trigger language plpgsql as $$
begin
  select id into new.linked_user_id from profiles where phone = new.phone limit 1;
  return new;
end $$;

drop trigger if exists contacts_link on contacts;
create trigger contacts_link before insert or update of phone on contacts
  for each row execute function link_contact_to_profile();
