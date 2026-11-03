import { redirect } from "next/navigation";

// Notifications moved into the header bell dialog. Keep the old URL
// working for bookmarks and external links by sending it home instead
// of rendering a second copy of the list.
export default function NotificationsPage() {
  redirect("/dashboard");
}
