import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '@rooms/contracts';
const bridge: DesktopBridge = {
  pendingInvite: () => ipcRenderer.invoke('rooms:pending-invite'),
  onInvite: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      invite: { serverUrl: string; code: string },
    ) => listener(invite);
    ipcRenderer.on('rooms:invite-link', handler);
    return () => ipcRenderer.removeListener('rooms:invite-link', handler);
  },
  platform: process.platform as DesktopBridge['platform'],
  windowAction: (action) => ipcRenderer.invoke('rooms:window', action),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('rooms:always-on-top', value),
  loginItemStatus: () => ipcRenderer.invoke('rooms:login-item-status'),
  setLoginItem: (value) => ipcRenderer.invoke('rooms:login-item', value),
  chooseMedia: () => ipcRenderer.invoke('rooms:choose-media'),
  releaseMedia: (url: string) => ipcRenderer.invoke('rooms:release-media', url),
  chooseCaption: (mediaUrl: string) => ipcRenderer.invoke('rooms:choose-caption', mediaUrl),
  openMediaExternal: (url) => ipcRenderer.invoke('rooms:external-media', url),
  applicationInfo: () => ipcRenderer.invoke('rooms:application-info'),
  diagnosticsPreview: () => ipcRenderer.invoke('rooms:diagnostics-preview'),
  thirdPartyNotices: () => ipcRenderer.invoke('rooms:third-party-notices'),
  exportDiagnostics: () => ipcRenderer.invoke('rooms:export-diagnostics'),
  dmCalls: {
    poll: () => ipcRenderer.invoke('rooms:dm-call-poll'),
    start: (dmId, mode) => ipcRenderer.invoke('rooms:dm-call-start', { dmId, mode }),
    respond: (callId, action) => ipcRenderer.invoke('rooms:dm-call-respond', { callId, action }),
    grant: (callId) => ipcRenderer.invoke('rooms:dm-call-grant', { callId }),
  },
  social: {
    session: () => ipcRenderer.invoke('rooms:social-session'),
    login: (input) => ipcRenderer.invoke('rooms:social-login', input),
    register: (input) => ipcRenderer.invoke('rooms:social-register', input),
    passwordRecoveryCapabilities: (serverUrl) =>
      ipcRenderer.invoke('rooms:social-password-recovery-capabilities', serverUrl),
    requestPasswordRecovery: (input) =>
      ipcRenderer.invoke('rooms:social-password-recovery-request', input),
    importPasswordRecoveryLink: (input) =>
      ipcRenderer.invoke('rooms:social-password-recovery-import', input),
    confirmPasswordRecovery: (input) =>
      ipcRenderer.invoke('rooms:social-password-recovery-confirm', input),
    cancelPasswordRecovery: (input) =>
      ipcRenderer.invoke('rooms:social-password-recovery-cancel', input),
    logout: () => ipcRenderer.invoke('rooms:social-logout'),
    spaces: () => ipcRenderer.invoke('rooms:social-spaces'),
    createSpace: (name) => ipcRenderer.invoke('rooms:social-create-space', name),
    renameSpace: (spaceId, name) => ipcRenderer.invoke('rooms:social-rename-space', spaceId, name),
    createChannel: (spaceId, name, type) =>
      ipcRenderer.invoke('rooms:social-create-channel', spaceId, name, type),
    renameChannel: (id, name) => ipcRenderer.invoke('rooms:social-rename-channel', id, name),
    deleteChannel: (id) => ipcRenderer.invoke('rooms:social-delete-channel', id),
    channelPermissions: (id) => ipcRenderer.invoke('rooms:social-channel-permissions', id),
    setChannelPermissions: (change) =>
      ipcRenderer.invoke('rooms:social-set-channel-permissions', change),
    communityManagement: (spaceId) =>
      ipcRenderer.invoke('rooms:social-community-management', spaceId),
    setMemberRoles: (change) => ipcRenderer.invoke('rooms:social-set-member-roles', change),
    removeCommunityMember: (change) =>
      ipcRenderer.invoke('rooms:social-remove-community-member', change),
    channels: (id) => ipcRenderer.invoke('rooms:social-channels', id),
    cachedMessages: (id) => ipcRenderer.invoke('rooms:social-cached-messages', id),
    messages: (id, before) => ipcRenderer.invoke('rooms:social-messages', id, before),
    send: (id, content, attachmentIds) =>
      ipcRenderer.invoke('rooms:social-send', id, content, attachmentIds),
    edit: (channel, id, content) => ipcRenderer.invoke('rooms:social-edit', channel, id, content),
    delete: (channel, id) => ipcRenderer.invoke('rooms:social-delete', channel, id),
    createInvite: (id) => ipcRenderer.invoke('rooms:social-create-invite', id),
    inspectInvite: (url, code) => ipcRenderer.invoke('rooms:social-inspect-invite', url, code),
    acceptInvite: (code) => ipcRenderer.invoke('rooms:social-accept-invite', code),
    avatar: (userId) => ipcRenderer.invoke('rooms:social-avatar', userId),
    chooseAvatar: () => ipcRenderer.invoke('rooms:social-choose-avatar'),
    readStates: () => ipcRenderer.invoke('rooms:social-read-states'),
    members: (spaceId) => ipcRenderer.invoke('rooms:social-members', spaceId),
    friends: () => ipcRenderer.invoke('rooms:social-friends'),
    addFriend: (username) => ipcRenderer.invoke('rooms:social-add-friend', username),
    removeFriend: (id) => ipcRenderer.invoke('rooms:social-remove-friend', id),
    updateProfile: (input) => ipcRenderer.invoke('rooms:social-profile', input),
    react: (channel, message, emoji, remove) =>
      ipcRenderer.invoke('rooms:social-react', channel, message, emoji, remove),
    discardAttachment: (id) => ipcRenderer.invoke('rooms:social-discard-attachment', id),
    chooseAttachment: (channel) => ipcRenderer.invoke('rooms:social-choose-attachment', channel),
    dms: () => ipcRenderer.invoke('rooms:social-dms'),
    createDM: (id) => ipcRenderer.invoke('rooms:social-create-dm', id),
    blockUser: (id) => ipcRenderer.invoke('rooms:social-block', id),
    unblockUser: (id) => ipcRenderer.invoke('rooms:social-unblock', id),
    removeMember: (space, id) => ipcRenderer.invoke('rooms:social-remove-member', space, id),
    ackRead: (channel, id) => ipcRenderer.invoke('rooms:social-ack', channel, id),
    typing: (channel, active) => ipcRenderer.invoke('rooms:social-typing', channel, active),
    presence: (status) => ipcRenderer.invoke('rooms:social-presence', status),
    onEvent: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        event: import('@rooms/social').GatewayEvent,
      ) => listener(event);
      ipcRenderer.on('rooms:social-event', handler);
      return () => {
        ipcRenderer.removeListener('rooms:social-event', handler);
      };
    },
  },
  soundboard: {
    list: (id) => ipcRenderer.invoke('rooms:soundboard-list', id),
    upload: (id, input) => ipcRenderer.invoke('rooms:soundboard-upload', id, input),
    read: (id, clip) => ipcRenderer.invoke('rooms:soundboard-read', id, clip),
    remove: (id, clip) => ipcRenderer.invoke('rooms:soundboard-remove', id, clip),
  },
  music: {
    snapshot: (channelId) => ipcRenderer.invoke('rooms:music-snapshot', channelId),
    command: (channelId, command) => ipcRenderer.invoke('rooms:music-command', channelId, command),
    search: (channelId, query) => ipcRenderer.invoke('rooms:music-search', channelId, query),
  },
  activity: {
    exportBoard: (roomId, format) => ipcRenderer.invoke('rooms:export-board', roomId, format),
    youtubePlaylist: (playlistId) => ipcRenderer.invoke('rooms:youtube-playlist', playlistId),
    youtubePlayer: (videoId) => ipcRenderer.invoke('rooms:youtube-player', videoId),
    snapshot: (roomId, afterRevision) =>
      ipcRenderer.invoke('rooms:activity-snapshot', roomId, afterRevision),
    command: (roomId, envelope) => ipcRenderer.invoke('rooms:activity-command', roomId, envelope),
  },
  updates: {
    status: () => ipcRenderer.invoke('rooms:update-status'),
    setOptIn: (value) => ipcRenderer.invoke('rooms:update-opt-in', value),
    check: () => ipcRenderer.invoke('rooms:update-check'),
    download: () => ipcRenderer.invoke('rooms:update-download'),
    cancel: () => ipcRenderer.invoke('rooms:update-cancel'),
    install: () => ipcRenderer.invoke('rooms:update-install'),
  },
  desktopWindow: {
    status: () => ipcRenderer.invoke('rooms:desktop-window-status'),
    setPreference: (key, value) =>
      ipcRenderer.invoke('rooms:desktop-window-preference', key, value),
  },
  notifications: {
    channelStatus: (input) => ipcRenderer.invoke('rooms:notification-channel-status', input),
    setChannelMuted: (input) => ipcRenderer.invoke('rooms:notification-channel-mute', input),
    status: () => ipcRenderer.invoke('rooms:notification-status'),
    setOptIn: (value) => ipcRenderer.invoke('rooms:notification-opt-in', value),
    setSound: (value) => ipcRenderer.invoke('rooms:notification-sound', value),
    setPauseDuringVoice: (value) => ipcRenderer.invoke('rooms:notification-pause-voice', value),
    setVoiceActive: (value) => ipcRenderer.invoke('rooms:notification-voice-active', value),
  },
  providers: {
    recentChannels: (id) => ipcRenderer.invoke('rooms:provider-recent-channels', id),
    acknowledgePlayback: (url) => ipcRenderer.invoke('rooms:provider-acknowledge-playback', url),
    updatePlaylist: (input) => ipcRenderer.invoke('rooms:provider-playlist-update', input),
    updateXtream: (input) => ipcRenderer.invoke('rooms:provider-xtream-update', input),
    rdCancel: () => ipcRenderer.invoke('rooms:provider-rd-cancel'),
    pickPlaylist: () => ipcRenderer.invoke('rooms:provider-pick-playlist'),
    playlistFile: (input) => ipcRenderer.invoke('rooms:provider-playlist-file', input),
    saveResume: (url, position) => ipcRenderer.invoke('rooms:provider-resume', url, position),
    status: () => ipcRenderer.invoke('rooms:provider-status'),
    connectPlaylist: (input) => ipcRenderer.invoke('rooms:provider-playlist', input),
    connectXtream: (input) => ipcRenderer.invoke('rooms:provider-xtream', input),
    epg: (id, channel) => ipcRenderer.invoke('rooms:provider-epg', id, channel),
    guide: (id, channels) => ipcRenderer.invoke('rooms:provider-guide', id, channels),
    channels: (id) => ipcRenderer.invoke('rooms:provider-channels', id),
    favorite: (id, channel, value) =>
      ipcRenderer.invoke('rooms:provider-favorite', id, channel, value),
    play: (id, channel) => ipcRenderer.invoke('rooms:provider-play', id, channel),
    disconnect: (id) => ipcRenderer.invoke('rooms:provider-disconnect', id),
    rdStart: () => ipcRenderer.invoke('rooms:provider-rd-start'),
    rdPoll: () => ipcRenderer.invoke('rooms:provider-rd-poll'),
    rdLibrary: () => ipcRenderer.invoke('rooms:provider-rd-library'),
    rdPlay: (id) => ipcRenderer.invoke('rooms:provider-rd-play', id),
  },
  agent: {
    previewArtifact: (taskId, artifactId) =>
      ipcRenderer.invoke('rooms:agent-artifact-preview', taskId, artifactId),
    authority: (roomId) => ipcRenderer.invoke('rooms:agent-authority', roomId),
    audit: (roomId) => ipcRenderer.invoke('rooms:agent-audit', roomId),
    configure: (input) => ipcRenderer.invoke('rooms:agent-configure', input),
    status: () => ipcRenderer.invoke('rooms:agent-status'),
    tasks: (room) => ipcRenderer.invoke('rooms:agent-tasks', room),
    submit: (input) => ipcRenderer.invoke('rooms:agent-submit', input),
    remind: (input) => ipcRenderer.invoke('rooms:agent-remind', input),
    cancel: (id) => ipcRenderer.invoke('rooms:agent-cancel', id),
    approve: (id) => ipcRenderer.invoke('rooms:agent-approve', id),
    resolveOperation: (id, input) => ipcRenderer.invoke('rooms:agent-resolve-operation', id, input),
    connections: () => ipcRenderer.invoke('rooms:agent-connections'),
    connectModel: (input) => ipcRenderer.invoke('rooms:agent-connect-model', input),
    disconnectModel: (id) => ipcRenderer.invoke('rooms:agent-disconnect-model', id),
    yolo: (value) => ipcRenderer.invoke('rooms:agent-yolo', value),
    memory: (room) => ipcRenderer.invoke('rooms:agent-memory', room),
    saveMemory: (input) => ipcRenderer.invoke('rooms:agent-save-memory', input),
    deleteMemory: (id) => ipcRenderer.invoke('rooms:agent-delete-memory', id),
    downloadArtifact: (task, id) => ipcRenderer.invoke('rooms:agent-artifact', task, id),
  },
  media: {
    directory: (channelIds) => ipcRenderer.invoke('rooms:media-directory', channelIds),
    grant: (id) => ipcRenderer.invoke('rooms:media-grant', id),
    presenter: (id, action) => ipcRenderer.invoke('rooms:media-presenter', id, action),
    screenState: (id) => ipcRenderer.invoke('rooms:media-screen-state', id),
    requestScreen: (channelId, leaseId, requestId) =>
      ipcRenderer.invoke('rooms:media-screen-request', { channelId, leaseId, requestId }),
    cancelScreenRequest: (channelId, leaseId, requestId) =>
      ipcRenderer.invoke('rooms:media-screen-request-cancel', { channelId, leaseId, requestId }),
    decideScreenRequest: (channelId, leaseId, requestId, approve) =>
      ipcRenderer.invoke('rooms:media-screen-request-decide', {
        channelId,
        leaseId,
        requestId,
        approve,
      }),
    leave: (id) => ipcRenderer.invoke('rooms:media-leave', id),
    captureSources: () => ipcRenderer.invoke('rooms:capture-sources'),
    selectCaptureSource: (id, options) => ipcRenderer.invoke('rooms:capture-select', id, options),
    clearCaptureSource: () => ipcRenderer.invoke('rooms:capture-clear'),
    captureStatus: () => ipcRenderer.invoke('rooms:capture-status'),
  },
};
contextBridge.exposeInMainWorld('rooms', bridge);
