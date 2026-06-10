// Configuração e Estado do Player
const pathParts = window.location.pathname.split('/');
const playlistId = pathParts[pathParts.length - 1] || 'loja-01';

let currentVideos = [];
let currentIndex = 0;
let currentVersion = 0;
let pendingPlaylistUpdate = null; // Guarda atualizações recebidas durante a exibição de um vídeo
let pollInterval = null;
let supabaseClient = null;

// Elementos da DOM
const videoEl = document.getElementById('tv-video');
const statusOverlay = document.getElementById('status-overlay');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');
const spinner = document.getElementById('spinner');
const tvBadge = document.getElementById('tv-badge');

// Inicialização
function init() {
  tvBadge.textContent = `TV: ${playlistId.toUpperCase()}`;
  
  // Inicializa Cliente Supabase
  initSupabase();

  if (supabaseClient) {
    // Carrega e inicia o player
    initPlayer();
  }

  // Event Listeners do Elemento de Vídeo
  videoEl.addEventListener('ended', handleVideoEnded);
  videoEl.addEventListener('error', handleVideoError);

  // Configura checagem de novas versões a cada 30 segundos
  if (supabaseClient) {
    pollInterval = setInterval(checkPlaylistUpdates, 30000);
  }

  // Inicializa o controle de tela cheia com auto-hide
  setupFullscreenControls();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// --- INICIALIZAÇÃO SUPABASE ---

function initSupabase() {
  const isPlaceholderUrl = !window.SUPABASE_URL || window.SUPABASE_URL.includes("SUA_SUPABASE_URL_AQUI");
  const isPlaceholderKey = !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes("SUA_SUPABASE_ANON_KEY_AQUI");

  if (isPlaceholderUrl || isPlaceholderKey) {
    showOverlay('Configuração Necessária', 'Configure a URL e a Anon Key no arquivo public/config.js para conectar este player ao Supabase.', false);
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  } catch (err) {
    console.error('Erro ao instanciar cliente Supabase:', err);
    showOverlay('Erro Crítico', 'Falha ao inicializar o Supabase SDK.', false);
  }
}

// Inicialização do Player
async function initPlayer() {
  showOverlay('Conectando...', 'Buscando programação no Supabase', true);
  
  try {
    const data = await fetchPlaylist(playlistId);
    currentVersion = data.version;
    currentVideos = data.videos || [];
    
    if (currentVideos.length === 0) {
      showOverlay('Nenhum Vídeo Ativo', 'Adicione e ative vídeos no painel de controle desta TV para iniciar a transmissão.', false);
      return;
    }
    
    hideOverlay();
    currentIndex = 0;
    playVideo(currentIndex);
  } catch (error) {
    console.error('Erro de inicialização:', error);
    showOverlay('Falha de Conexão', 'Não foi possível carregar a programação. Tentando novamente em 5 segundos...', false);
    setTimeout(initPlayer, 5000);
  }
}

// Buscar dados da API do Supabase
async function fetchPlaylist(id) {
  if (!supabaseClient) throw new Error('Supabase não inicializado');

  const { data, error } = await supabaseClient
    .from('playlists')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  // Se a playlist não existir, retorna um objeto vazio estruturado
  if (!data) {
    return { id, version: 1, videos: [] };
  }

  // Filtra apenas vídeos ativos para o Player
  const activeVideos = (data.videos || []).filter(v => v.active);

  return {
    id: data.id,
    version: data.version,
    videos: activeVideos
  };
}

// Tocar um vídeo pelo index
function playVideo(index) {
  if (currentVideos.length === 0) return;
  
  if (index >= currentVideos.length) {
    currentIndex = 0;
  } else if (index < 0) {
    currentIndex = currentVideos.length - 1;
  } else {
    currentIndex = index;
  }

  const video = currentVideos[currentIndex];
  console.log(`Reproduzindo [${currentIndex + 1}/${currentVideos.length}]: ${video.originalname}`);
  
  videoEl.src = video.url;
  videoEl.load();

  const playPromise = videoEl.play();
  
  if (playPromise !== undefined) {
    playPromise.catch(error => {
      console.warn('Autoplay bloqueado com som. Tentando tocar mudo...', error);
      videoEl.muted = true;
      videoEl.play().catch(err => {
        console.error('Falha crítica ao reproduzir:', err);
        showOverlay('Clique para Iniciar', 'O navegador bloqueou a reprodução automática. Toque em qualquer lugar da tela.', false);
        
        const startPlayback = () => {
          videoEl.play();
          hideOverlay();
          document.removeEventListener('click', startPlayback);
        };
        document.addEventListener('click', startPlayback);
      });
    });
  }
}

// Handler para o término do vídeo (Avança na fila)
function handleVideoEnded() {
  console.log('Vídeo finalizado.');

  // Se houver uma atualização de playlist pendente, nós aplicamos agora na transição
  if (pendingPlaylistUpdate) {
    console.log('Aplicando atualização de playlist pendente...');
    currentVideos = pendingPlaylistUpdate.videos;
    currentVersion = pendingPlaylistUpdate.version;
    pendingPlaylistUpdate = null;
    
    if (currentVideos.length === 0) {
      showOverlay('Nenhum Vídeo Encontrado', 'A playlist foi esvaziada ou desativada no painel de controle.', false);
      videoEl.src = '';
      return;
    }
    
    currentIndex = 0;
    playVideo(currentIndex);
    return;
  }

  if (currentVideos.length > 0) {
    currentIndex = (currentIndex + 1) % currentVideos.length;
    playVideo(currentIndex);
  }
}

// Handler de erro no player (Self-healing)
function handleVideoError(e) {
  console.error('Erro de reprodução no vídeo:', videoEl.error);
  
  showOverlay('Erro de Reprodução', 'Ocorreu uma falha ao renderizar o vídeo atual. Pulando para o próximo em 5 segundos...', false);
  
  setTimeout(() => {
    hideOverlay();
    if (currentVideos.length > 1) {
      currentIndex = (currentIndex + 1) % currentVideos.length;
      playVideo(currentIndex);
    } else {
      initPlayer();
    }
  }, 5000);
}

// Checagem de atualizações em background (Polling)
async function checkPlaylistUpdates() {
  if (!supabaseClient) return;

  try {
    const data = await fetchPlaylist(playlistId);
    
    if (data.version !== currentVersion) {
      console.log(`Nova versão de playlist detectada no Supabase: ${data.version} (Atual: ${currentVersion})`);
      
      // Se o player estava parado sem vídeos, aplica imediatamente
      if (currentVideos.length === 0) {
        currentVideos = data.videos || [];
        currentVersion = data.version;
        if (currentVideos.length > 0) {
          hideOverlay();
          currentIndex = 0;
          playVideo(currentIndex);
        }
      } else {
        // Guarda na fila para aplicar de forma suave entre as transições
        pendingPlaylistUpdate = data;
      }
    }
  } catch (error) {
    console.warn('Erro ao checar atualizações em background no Supabase:', error);
  }
}

// Helpers do Overlay visual
function showOverlay(title, desc, showSpinner = false) {
  statusTitle.textContent = title;
  statusDesc.textContent = desc;
  
  if (showSpinner) {
    spinner.classList.remove('hidden');
  } else {
    spinner.classList.add('hidden');
  }
  
  statusOverlay.classList.add('active');
}

function hideOverlay() {
  statusOverlay.classList.remove('active');
}

// --- CONTROLE DE TELA CHEIA E MOUSE AUTO-HIDE ---

function setupFullscreenControls() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;

  btn.addEventListener('click', toggleFullscreen);

  let mouseTimeout;
  
  function showCursorAndButton() {
    document.body.classList.add('show-cursor');
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    
    clearTimeout(mouseTimeout);
    mouseTimeout = setTimeout(() => {
      document.body.classList.remove('show-cursor');
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
    }, 5000); // Esconde após 5 segundos sem interação
  }

  // Exibe o botão no carregamento inicial
  showCursorAndButton();

  // Monitora movimento do mouse/controle, cliques e teclas do controle da TV
  window.addEventListener('mousemove', showCursorAndButton);
  window.addEventListener('click', showCursorAndButton);
  window.addEventListener('touchstart', showCursorAndButton);
  window.addEventListener('keydown', showCursorAndButton);
}

function toggleFullscreen() {
  if (!document.fullscreenElement && 
      !document.webkitFullscreenElement && 
      !document.mozFullScreenElement && 
      !document.msFullscreenElement) {
    // Entra em tela cheia
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    }
  } else {
    // Sai da tela cheia
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}
