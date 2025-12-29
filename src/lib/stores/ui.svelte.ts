// État de l'interface utilisateur
let isDragging = $state(false);
let showSettings = $state(false);
let notification = $state<{
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  visible: boolean;
}>({
  type: 'info',
  message: '',
  visible: false
});

let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

export const uiStore = {
  get isDragging() {
    return isDragging;
  },

  get showSettings() {
    return showSettings;
  },

  get notification() {
    return notification;
  },

  setDragging(value: boolean) {
    isDragging = value;
  },

  toggleSettings() {
    showSettings = !showSettings;
  },

  setShowSettings(value: boolean) {
    showSettings = value;
  },

  showNotification(type: 'success' | 'error' | 'info' | 'warning', message: string, duration = 5000) {
    // Clear existing timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    notification = { type, message, visible: true };

    if (duration > 0) {
      notificationTimeout = setTimeout(() => {
        notification = { ...notification, visible: false };
      }, duration);
    }
  },

  hideNotification() {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }
    notification = { ...notification, visible: false };
  }
};

