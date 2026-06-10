// Estado Global da Aplicação Admin
let currentPlaylistId = 'loja-01';
let playlistVideos = []; // Fila de vídeos na memória do navegador
let playlistVersion = 0;
let supabaseClient = null;

// Elementos da DOM
const playlistIdInput = document.getElementById('playlist-id-input');
const btnLoadPlaylist = document.getElementById('btn-load-playlist');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadProgressList = document.getElementById('upload-progress-list');
const tvPlayerUrl = document.getElementById('tv-player-url');
const btnCopyUrl = document.getElementById('btn-copy-url');
const btnOpenPlayer = document.getElementById('btn-open-player');
const playlistVersionEl = document.getElementById('playlist-version');
const videoList = document.getElementById('video-list');
const emptyState = document.getElementById('empty-state');
const activeCountEl = document.getElementById('active-count');
const totalCountEl = document.getElementById('total-count');
const btnSavePlaylist = document.getElementById('btn-save-playlist');
const toastContainer = document.getElementById('toast-container');

// Inicialização
function init() {
  // Inicializa o Cliente Supabase
  initSupabase();

  // Carrega a playlist inicial
  if (supabaseClient) {
    loadPlaylist(currentPlaylistId);
  }
  
  // Event Listeners
  btnLoadPlaylist.addEventListener('click', () => {
    const targetId = playlistIdInput.value.trim();
    if (targetId) {
      loadPlaylist(targetId);
    }
  });

  playlistIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const targetId = playlistIdInput.value.trim();
      if (targetId) {
        loadPlaylist(targetId);
      }
    }
  });

  // Copiar Link
  btnCopyUrl.addEventListener('click', copyPlayerLink);

  // Salvar alterações
  btnSavePlaylist.addEventListener('click', savePlaylistChanges);

  // Drag and Drop Upload Zone
  dropZone.addEventListener('click', () => {
    if (!checkSupabaseInitialized()) return;
    fileInput.click();
  });
  
  fileInput.addEventListener('change', handleFileSelect);
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    if (!checkSupabaseInitialized()) return;
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      uploadFiles(files);
    }
  });

  // Setup do Drag & Drop para a ordenação da lista
  setupDragAndDropSorting();
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
    showToast('Atenção: Configure as credenciais no arquivo "public/config.js"!', 'warning');
    showOverlayError('Configuração Pendente', 'Abra o arquivo public/config.js e adicione a URL e a Anon Key do seu projeto Supabase para habilitar o painel.');
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  } catch (err) {
    console.error('Erro ao instanciar cliente Supabase:', err);
    showToast('Erro crítico ao inicializar o Supabase SDK.', 'error');
  }
}

function checkSupabaseInitialized() {
  if (!supabaseClient) {
    showToast('Erro: Supabase não está configurado. Verifique o arquivo public/config.js', 'error');
    return false;
  }
  return true;
}

function showOverlayError(title, desc) {
  // Oculta a lista de vídeos e exibe mensagem de configuração no emptyState
  emptyState.style.display = 'flex';
  emptyState.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color: var(--color-warning); width: 64px; height: 64px;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
    <h3 style="margin-top: 1rem; font-size: 1.15rem; font-weight: 600;">${title}</h3>
    <p class="sub-text" style="max-width: 380px; margin: 0.5rem auto 0; font-size: 0.85rem; line-height: 1.4;">${desc}</p>
  `;
}

// --- FUNÇÕES DA API E DADOS ---

// Carregar Playlist do Supabase Database
async function loadPlaylist(id) {
  if (!checkSupabaseInitialized()) return;

  const normalizedId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  currentPlaylistId = normalizedId;
  playlistIdInput.value = normalizedId;

  // Atualiza os links e inputs de URL para o preview
  const origin = window.location.origin;
  const playerLink = `${origin}/player/${normalizedId}`;
  tvPlayerUrl.value = playerLink;
  btnOpenPlayer.href = playerLink;

  try {
    // Busca registro único na tabela 'playlists'
    const { data, error } = await supabaseClient
      .from('playlists')
      .select('*')
      .eq('id', normalizedId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Se não houver registro, inicializamos um no banco para manter persistência
      const newPlaylist = {
        id: normalizedId,
        version: 1,
        videos: []
      };
      
      const { error: insertError } = await supabaseClient
        .from('playlists')
        .insert([newPlaylist]);

      if (insertError) throw insertError;

      playlistVersion = 1;
      playlistVideos = [];
    } else {
      playlistVersion = data.version;
      playlistVideos = data.videos || [];
    }
    
    playlistVersionEl.textContent = playlistVersion;
    renderPlaylist();
    showToast('Playlist carregada do Supabase!', 'success');
  } catch (error) {
    console.error('Erro ao ler playlist do Supabase:', error);
    showToast('Erro ao buscar dados no Supabase. Crie a tabela primeiro!', 'error');
  }
}

// Renderizar lista de vídeos
function renderPlaylist() {
  videoList.innerHTML = '';
  
  if (playlistVideos.length === 0) {
    emptyState.style.display = 'flex';
    emptyState.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-7.5c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125zm0-3h7.5m-7.5 0a1.125 1.125 0 01-1.125-1.125V13.88c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125zm0-3h7.5m-7.5 0a1.125 1.125 0 01-1.125-1.125V10.5c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125zm0-3h7.5m-7.5 0a1.125 1.125 0 01-1.125-1.125V7.12c0-.621.504-1.125 1.125-1.125h7.5c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125zm0-3h7.5m-7.5 0A1.125 1.125 0 012.25 3.75v1.5c0 .621.504 1.125 1.125 1.125h7.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-7.5zM12 18.75h9m-9-3h9m-9-3h9m-9-3h9m-9-3h9" />
      </svg>
      <p>Nenhum vídeo nesta playlist.</p>
      <p class="sub-text">Arraste arquivos na zona de upload à esquerda para começar.</p>
    `;
    activeCountEl.textContent = '0';
    totalCountEl.textContent = '0';
    return;
  }
  
  emptyState.style.display = 'none';
  
  let activeCount = 0;
  
  playlistVideos.forEach((video, index) => {
    if (video.active) activeCount++;
    
    const li = document.createElement('li');
    li.className = `video-item ${video.active ? '' : 'inactive'}`;
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-id', video.id);
    li.setAttribute('data-index', index);
    
    const sizeMB = (video.size / (1024 * 1024)).toFixed(1);
    
    li.innerHTML = `
      <div class="video-item-left">
        <div class="drag-handle" title="Arraste para reordenar">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75h16.5M3.75 9h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5" />
          </svg>
        </div>
        <div class="video-details">
          <div class="video-title" title="${escapeHtml(video.originalname)}">
            ${index + 1}. ${escapeHtml(video.originalname)}
          </div>
          <div class="video-meta">
            <span>Tamanho: ${sizeMB} MB</span>
            <span>ID: ${video.id}</span>
          </div>
        </div>
      </div>
      <div class="video-item-right">
        <!-- Botões de Reordenamento (Acessibilidade/Smart TV) -->
        <div class="order-buttons">
          <button class="order-btn btn-up" title="Mover para cima" onclick="moveVideo(${index}, -1)">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
          <button class="order-btn btn-down" title="Mover para baixo" onclick="moveVideo(${index}, 1)">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
        
        <!-- Toggle Ativo -->
        <label class="switch" title="Ativo / Inativo na TV">
          <input type="checkbox" ${video.active ? 'checked' : ''} onchange="toggleVideoActive('${video.id}', this.checked)">
          <span class="slider"></span>
        </label>
        
        <!-- Botão Deletar -->
        <button class="btn-danger-icon" title="Excluir vídeo" onclick="deleteVideo('${video.id}', '${escapeHtml(video.originalname)}')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    `;
    videoList.appendChild(li);
  });

  activeCountEl.textContent = activeCount;
  totalCountEl.textContent = playlistVideos.length;
}

// Alternar status ativo
window.toggleVideoActive = function(videoId, isChecked) {
  const video = playlistVideos.find(v => v.id === videoId);
  if (video) {
    video.active = isChecked;
    
    const li = videoList.querySelector(`[data-id="${videoId}"]`);
    if (li) {
      if (isChecked) {
        li.classList.remove('inactive');
      } else {
        li.classList.add('inactive');
      }
    }
    
    const activeCount = playlistVideos.filter(v => v.active).length;
    activeCountEl.textContent = activeCount;
    btnSavePlaylist.classList.add('glow');
  }
};

// Reordenação por botão
window.moveVideo = function(currentIndex, direction) {
  const targetIndex = currentIndex + direction;
  
  if (targetIndex < 0 || targetIndex >= playlistVideos.length) {
    return;
  }
  
  const temp = playlistVideos[currentIndex];
  playlistVideos[currentIndex] = playlistVideos[targetIndex];
  playlistVideos[targetIndex] = temp;
  
  renderPlaylist();
  btnSavePlaylist.classList.add('glow');
};

// Excluir vídeo (Remover do Storage + Database)
window.deleteVideo = async function(videoId, name) {
  if (!checkSupabaseInitialized()) return;
  if (!confirm(`Tem certeza que deseja excluir "${name}"? Esta ação removerá o arquivo físico do Storage do Supabase.`)) {
    return;
  }

  try {
    const video = playlistVideos.find(v => v.id === videoId);
    if (!video) return;

    // 1. Exclui o arquivo físico do Storage
    const storagePath = `${currentPlaylistId}/${video.filename}`;
    const { error: storageError } = await supabaseClient.storage
      .from('videos')
      .remove([storagePath]);

    if (storageError) {
      console.warn('Erro ao deletar do Storage (pode ser que já tenha sido deletado):', storageError);
    }

    // 2. Remove localmente
    playlistVideos = playlistVideos.filter(v => v.id !== videoId);
    playlistVersion += 1;

    // 3. Atualiza tabela no banco
    const { error: dbError } = await supabaseClient
      .from('playlists')
      .update({
        videos: playlistVideos,
        version: playlistVersion
      })
      .eq('id', currentPlaylistId);

    if (dbError) throw dbError;

    playlistVersionEl.textContent = playlistVersion;
    renderPlaylist();
    showToast(`Vídeo "${name}" excluído com sucesso!`, 'success');
  } catch (error) {
    console.error(error);
    showToast('Erro ao remover o vídeo.', 'error');
  }
};

// Salvar alterações
async function savePlaylistChanges() {
  if (!checkSupabaseInitialized()) return;

  try {
    playlistVersion += 1;

    const { error } = await supabaseClient
      .from('playlists')
      .update({
        videos: playlistVideos,
        version: playlistVersion
      })
      .eq('id', currentPlaylistId);

    if (error) throw error;

    playlistVersionEl.textContent = playlistVersion;
    renderPlaylist();
    btnSavePlaylist.classList.remove('glow');
    showToast('Alterações salvas com sucesso no Supabase!', 'success');
  } catch (error) {
    console.error(error);
    showToast('Erro ao salvar playlist.', 'error');
  }
}

// --- LÓGICA DE UPLOAD DIRETO PARA SUPABASE STORAGE ---

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    uploadFiles(files);
  }
}

async function uploadFiles(files) {
  if (!checkSupabaseInitialized()) return;

  const validFiles = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isMp4 = file.type === 'video/mp4' || fileExt === '.mp4';
    if (isMp4) {
      validFiles.push(file);
    }
  }

  if (validFiles.length === 0) {
    showToast('Por favor, selecione apenas arquivos de vídeo no formato MP4.', 'error');
    return;
  }

  // Faz upload em lote um por um
  for (let file of validFiles) {
    const uploadId = 'upload_' + Date.now() + '_' + Math.round(Math.random() * 100);
    
    // Cria item visual de progresso
    const progressItem = document.createElement('div');
    progressItem.className = 'progress-item';
    progressItem.id = uploadId;
    progressItem.innerHTML = `
      <div class="progress-info">
        <div class="progress-name">Enviando: ${escapeHtml(file.name)}</div>
        <div class="progress-percent" id="${uploadId}_percent">0%</div>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="${uploadId}_bar" style="width: 0%;"></div>
      </div>
    `;
    uploadProgressList.prepend(progressItem);

    // Gera nome único de arquivo para evitar colisões
    const fileExt = file.name.substring(file.name.lastIndexOf('.'));
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;
    const storagePath = `${currentPlaylistId}/${uniqueName}`;

    try {
      // Upload para o bucket 'videos' usando o Supabase Storage SDK com monitoramento de progresso
      const { data, error } = await supabaseClient.storage
        .from('videos')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          // Função nativa do Supabase JS v2 para monitorar uploads em tempo real
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            const percentEl = document.getElementById(`${uploadId}_percent`);
            const barEl = document.getElementById(`${uploadId}_bar`);
            if (percentEl && barEl) {
              percentEl.textContent = percent + '%';
              barEl.style.width = percent + '%';
            }
          }
        });

      if (error) throw error;

      // Obtém o link público da URL do vídeo enviado
      const { data: urlData } = supabaseClient.storage
        .from('videos')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // Cria a estrutura do objeto de vídeo
      const newVideo = {
        id: 'vid_' + Date.now() + '_' + Math.round(Math.random() * 1000),
        filename: uniqueName,
        originalname: file.name,
        url: publicUrl,
        active: true,
        size: file.size,
        uploadedAt: new Date().toISOString()
      };

      // Adiciona na playlist
      playlistVideos.push(newVideo);
      playlistVersion += 1;

      // Grava atualização no Banco de Dados
      const { error: dbError } = await supabaseClient
        .from('playlists')
        .update({
          videos: playlistVideos,
          version: playlistVersion
        })
        .eq('id', currentPlaylistId);

      if (dbError) throw dbError;

      // Conclui progresso visualmente
      progressItem.classList.add('complete');
      document.getElementById(`${uploadId}_percent`).textContent = 'Concluído!';
      document.getElementById(`${uploadId}_bar`).style.width = '100%';
      
      playlistVersionEl.textContent = playlistVersion;
      renderPlaylist();
      showToast(`Vídeo "${file.name}" enviado com sucesso!`, 'success');

      // Remove barra de progresso após 3 segundos
      setTimeout(() => {
        progressItem.style.opacity = '0';
        progressItem.style.transition = 'opacity 0.5s ease';
        setTimeout(() => progressItem.remove(), 500);
      }, 3000);

    } catch (err) {
      console.error(err);
      progressItem.classList.add('error');
      document.getElementById(`${uploadId}_percent`).textContent = 'Erro';
      document.getElementById(`${uploadId}_bar`).style.width = '100%';
      showToast(`Falha ao enviar o arquivo "${file.name}": ` + err.message, 'error');
    }
  }

  fileInput.value = '';
}

// --- DRAG AND DROP DA FILA ---

function setupDragAndDropSorting() {
  let dragSrcEl = null;

  videoList.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.video-item');
    if (!item) return;

    dragSrcEl = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.getAttribute('data-id'));
  });

  videoList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const item = e.target.closest('.video-item');
    if (!item || item === dragSrcEl) return;
    
    const bounding = item.getBoundingClientRect();
    const offset = e.clientY - bounding.top;
    if (offset > bounding.height / 2) {
      item.after(dragSrcEl);
    } else {
      item.before(dragSrcEl);
    }
  });

  videoList.addEventListener('dragend', (e) => {
    const item = e.target.closest('.video-item');
    if (item) item.classList.remove('dragging');
    rebuildVideosArrayFromDOM();
  });
}

function rebuildVideosArrayFromDOM() {
  const currentDOMItems = Array.from(videoList.querySelectorAll('.video-item'));
  const newOrderedList = [];
  
  currentDOMItems.forEach(item => {
    const id = item.getAttribute('data-id');
    const origVideo = playlistVideos.find(v => v.id === id);
    if (origVideo) {
      newOrderedList.push(origVideo);
    }
  });

  playlistVideos = newOrderedList;
  
  currentDOMItems.forEach((item, idx) => {
    const titleEl = item.querySelector('.video-title');
    const origVideo = playlistVideos[idx];
    if (titleEl && origVideo) {
      titleEl.textContent = `${idx + 1}. ${origVideo.originalname}`;
      item.setAttribute('data-index', idx);
      item.querySelector('.btn-up').setAttribute('onclick', `moveVideo(${idx}, -1)`);
      item.querySelector('.btn-down').setAttribute('onclick', `moveVideo(${idx}, 1)`);
    }
  });

  btnSavePlaylist.classList.add('glow');
}

// --- UTILS ---

function copyPlayerLink() {
  tvPlayerUrl.select();
  tvPlayerUrl.setSelectionRange(0, 99999);

  try {
    navigator.clipboard.writeText(tvPlayerUrl.value);
    showToast('Link copiado para a área de transferência!', 'success');
  } catch (err) {
    document.execCommand('copy');
    showToast('Link copiado!', 'success');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  toastContainer.appendChild(toast);
  
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
