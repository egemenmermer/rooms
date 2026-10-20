#!/usr/bin/env bash
# ROOMS one-command server installer for a fresh Ubuntu/Debian server.
#
#   curl -fsSL https://raw.githubusercontent.com/egemenmermer/rooms/main/deploy/install.sh | sudo bash
#
# Installs Docker if missing, downloads ROOMS into /opt/rooms, generates private
# configuration, starts the services and creates the owner account and community.
set -euo pipefail

ROOMS_REPO="${ROOMS_REPO:-https://github.com/egemenmermer/rooms.git}"
ROOMS_DIR="${ROOMS_DIR:-/opt/rooms}"
ROOMS_REF="${ROOMS_REF:-main}"

say() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
die() {
  printf '\033[31m✘ %s\033[0m\n' "$*" >&2
  exit 1
}

# Wrapped in a function so `curl | bash` reads the whole script before running it.
main() {
  [[ $EUID -eq 0 ]] || die "Kurulumu root olarak çalıştır: curl ... | sudo bash"
  [[ "$(uname -s)" == Linux ]] || die "Sunucu kurulumu yalnızca Linux'ta desteklenir."
  . /etc/os-release 2>/dev/null || true
  case "${ID:-}" in
  ubuntu | debian) ;;
  *) echo "Uyarı: Ubuntu/Debian dışındaki dağıtımlar denenmedi (${PRETTY_NAME:-bilinmiyor})." ;;
  esac
  [[ -r /dev/tty ]] || die "Kurulum soruları için etkileşimli bir terminal gerekiyor (ssh ile bağlanıp çalıştır)."

  mem_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
  if ((mem_mb < 1800)); then
    die "En az 2 GB RAM gerekiyor (bu sunucuda ${mem_mb} MB var). 4 GB önerilir."
  elif ((mem_mb < 3500)); then
    echo "Uyarı: ${mem_mb} MB RAM var. Küçük bir grup için yeter; 4 GB önerilir."
  fi

  say "Gerekli paketler"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git openssl >/dev/null
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    say "Docker kuruluyor"
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker compose version >/dev/null || die "Docker Compose kurulamadı."

  say "Tayfa indiriliyor → $ROOMS_DIR"
  if [[ -d "$ROOMS_DIR/.git" ]]; then
    git -C "$ROOMS_DIR" fetch --quiet --tags origin
  else
    [[ ! -e "$ROOMS_DIR" || -z "$(ls -A "$ROOMS_DIR")" ]] ||
      die "$ROOMS_DIR boş değil ve bir Tayfa kurulumu değil. ROOMS_DIR=/baska/yol ile tekrar dene."
    git clone --quiet "$ROOMS_REPO" "$ROOMS_DIR"
  fi
  git -C "$ROOMS_DIR" checkout --quiet "$ROOMS_REF"
  ln -sf "$ROOMS_DIR/deploy/rooms" /usr/local/bin/rooms

  if [[ ! -f "$ROOMS_DIR/deploy/.env" ]]; then
    say "Yapılandırma"
    rooms setup
  fi

  say "Güvenlik duvarı"
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
    rooms firewall
  else
    echo "  Sunucu sağlayıcının güvenlik duvarında şu portların açık olduğundan emin ol:"
    echo "  80/tcp, 443/tcp (HTTPS) · 7881/tcp, 7882/udp (ses ve görüntü)"
  fi

  say "Servisler başlatılıyor"
  rooms up

  say "Topluluk"
  rooms bootstrap

  say "İlk davet bağlantın"
  rooms invite

  domain="$(grep -E '^ROOMS_DOMAIN=' "$ROOMS_DIR/deploy/.env" | cut -d= -f2-)"
  printf '\n\033[1;32mTayfa sunucun hazır!\033[0m\n\n'
  echo "  Sunucu adresi:  https://$domain"
  echo "  1. Tayfa uygulamasını indir:https://github.com/egemenmermer/rooms/releases/latest"
  echo "  2. Uygulamada 'Giriş yap' sekmesinde sunucu adresini gir, sahip hesabınla giriş yap."
  echo "  3. 'Davet oluştur' ile bağlantıyı arkadaşlarına gönder (ya da sunucuda: rooms invite)."
  echo
  echo "  Yararlı komutlar: rooms status · rooms invite · rooms backup · rooms update · rooms help"
}

main "$@"
