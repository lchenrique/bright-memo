import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const cookieStore = await cookies();
  const apiKey = cookieStore.get('bm_api_key');

  if (apiKey?.value) {
    redirect('/dashboard');
  }

  redirect('/login');
}
