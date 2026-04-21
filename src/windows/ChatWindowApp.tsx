import { useShowWindowOnMount } from '../hooks/useShowWindowOnMount';
import { ChatWindow } from '../components/ChatWindow';

export function ChatWindowApp() {
  useShowWindowOnMount();
  return <ChatWindow />;
}