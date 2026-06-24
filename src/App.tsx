import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useAuth from './features/auth/useAuth';
import router from './router';
import { useUIStore } from './stores/uiStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  // Inicializa o sincronizador automático de sessão do Firebase Auth com claims do Zustand
  useAuth();

  const { productScope } = useUIStore();

  useEffect(() => {
    // Sincroniza a classe do body com o tema do produto ativo
    document.body.classList.remove('theme-wizmart', 'theme-smart_cafe');
    if (productScope !== 'all') document.body.classList.add(`theme-${productScope}`);
  }, [productScope]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
