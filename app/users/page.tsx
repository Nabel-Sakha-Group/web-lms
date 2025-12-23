import { redirect } from 'next/navigation';

export default function Page() {
  // Redirect any direct visits to the users page back to home/dashboard
  redirect('/');

}
