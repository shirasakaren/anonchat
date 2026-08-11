#!/bin/sh
# Interactive setup for a fresh Termine deployment on a VPS.
# Usage: curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/setup.sh | sh
#    or, from a checked-out clone: ./scripts/setup.sh
set -eu

REPO_URL="${TERMINE_REPO_URL:-}"
INSTALL_DIR="${TERMINE_INSTALL_DIR:-termine}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$1"; }
err() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$1 is required but not installed."
    return 1
  fi
}

detect_os() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  elif [ "$(uname)" = "Darwin" ]; then
    echo "macos"
  else
    echo "unknown"
  fi
}

install_docker() {
  os="$1"
  info "Docker is not installed. Attempting to install it..."
  case "$os" in
    ubuntu | debian)
      curl -fsSL https://get.docker.com | sh
      ;;
    macos)
      err "Please install Docker Desktop for Mac from https://www.docker.com/products/docker-desktop and re-run this script."
      exit 1
      ;;
    *)
      err "Automatic Docker installation isn't supported on this OS (detected: $os)."
      err "Install Docker and Docker Compose manually, then re-run this script: https://docs.docker.com/engine/install/"
      exit 1
      ;;
  esac
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

random_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -d '=+/' | cut -c1-24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-24
  fi
}

prompt() {
  # prompt "Question" "default" -> echoes the answer
  question="$1"
  default="$2"
  if [ -n "$default" ]; then
    printf '%s [%s]: ' "$question" "$default" >&2
  else
    printf '%s: ' "$question" >&2
  fi
  read -r answer || answer=""
  if [ -z "$answer" ]; then
    echo "$default"
  else
    echo "$answer"
  fi
}

prompt_yn() {
  question="$1"
  default="$2" # y or n
  while true; do
    printf '%s [%s]: ' "$question" "$default" >&2
    read -r answer || answer=""
    [ -z "$answer" ] && answer="$default"
    case "$answer" in
      y | Y | yes | YES) echo "y"; return ;;
      n | N | no | NO) echo "n"; return ;;
      *) echo "Please answer y or n." >&2 ;;
    esac
  done
}

main() {
  bold "Termine setup"
  echo "Self-hosted anonymous messaging inbox - one-time deployment setup."
  echo

  os=$(detect_os)
  info "Detected OS: $os"

  if ! command -v docker >/dev/null 2>&1; then
    if [ "$(prompt_yn "Docker isn't installed. Install it now?" "y")" = "y" ]; then
      install_docker "$os"
    else
      err "Docker is required. Exiting."
      exit 1
    fi
  else
    info "Docker is already installed."
  fi

  if ! docker compose version >/dev/null 2>&1; then
    err "Docker Compose plugin not found. It ships with modern Docker installs -"
    err "if you installed Docker manually, see: https://docs.docker.com/compose/install/"
    exit 1
  fi

  # If we're not already inside a checked-out repo (no docker-compose.yml here),
  # clone it.
  if [ ! -f "docker-compose.yml" ]; then
    if [ -z "$REPO_URL" ]; then
      REPO_URL=$(prompt "Git URL to clone (leave blank if you already have the source elsewhere)" "")
    fi
    if [ -n "$REPO_URL" ]; then
      require_cmd git
      info "Cloning $REPO_URL into $INSTALL_DIR..."
      git clone "$REPO_URL" "$INSTALL_DIR"
      cd "$INSTALL_DIR"
    else
      err "No docker-compose.yml found in the current directory and no repo URL given."
      err "Run this script from inside the cloned project, or set TERMINE_REPO_URL."
      exit 1
    fi
  fi

  if [ -f ".env" ]; then
    warn ".env already exists."
    if [ "$(prompt_yn "Overwrite it with a fresh configuration?" "n")" = "n" ]; then
      info "Keeping existing .env. Skipping configuration - will just (re)start the stack."
      docker compose up -d --build
      info "Done. Visit your site to continue onboarding if it's not finished yet."
      exit 0
    fi
  fi

  echo
  bold "Configuration"
  echo "Press Enter to accept the default shown in [brackets]."
  echo

  public_url=$(prompt "Public URL this site will be served at (include https:// if you have a domain/reverse proxy)" "http://localhost:3000")
  port=$(prompt "Local port to bind (change if 3000 is taken)" "3000")

  echo
  echo "File storage for attachments:"
  echo "  1) Local disk (default - no extra setup, files stay on this server)"
  echo "  2) S3-compatible (AWS S3, Cloudflare R2, Backblaze B2, or your own endpoint)"
  echo "  3) Self-hosted MinIO (runs alongside this app in Docker)"
  storage_choice=$(prompt "Choose 1, 2, or 3" "1")

  storage_driver="local"
  s3_endpoint=""
  s3_region="auto"
  s3_bucket=""
  s3_access_key=""
  s3_secret_key=""
  s3_force_path_style="true"
  use_minio_profile="n"

  case "$storage_choice" in
    2)
      storage_driver="s3"
      s3_endpoint=$(prompt "S3 endpoint URL (leave blank for AWS S3)" "")
      s3_region=$(prompt "S3 region" "auto")
      s3_bucket=$(prompt "S3 bucket name" "termine")
      s3_access_key=$(prompt "S3 access key ID" "")
      s3_secret_key=$(prompt "S3 secret access key" "")
      if [ -z "$s3_endpoint" ]; then s3_force_path_style="false"; fi
      ;;
    3)
      storage_driver="s3"
      use_minio_profile="y"
      s3_endpoint="http://minio:9000"
      s3_bucket="termine"
      s3_access_key="termine"
      s3_secret_key=$(random_password)
      s3_force_path_style="true"
      info "MinIO will be started alongside the app with generated credentials."
      ;;
    *) ;;
  esac

  echo
  echo "IP address logging (used only for abuse mitigation; off protects privacy by default):"
  store_ips=$(prompt_yn "Store submitter IP addresses?" "n")

  echo
  turnstile_choice=$(prompt_yn "Enable Cloudflare Turnstile CAPTCHA on identity creation?" "n")
  turnstile_site_key=""
  turnstile_secret_key=""
  if [ "$turnstile_choice" = "y" ]; then
    turnstile_site_key=$(prompt "Turnstile site key" "")
    turnstile_secret_key=$(prompt "Turnstile secret key" "")
  fi

  session_secret=$(random_secret)
  postgres_password=$(random_password)

  info "Generating .env..."
  cat > .env << EOF
POSTGRES_PASSWORD=$postgres_password
POSTGRES_USER=termine
POSTGRES_DB=termine

SESSION_SECRET=$session_secret
PUBLIC_URL=$public_url
PORT=$port
TRUST_PROXY=false

STORE_IP_ADDRESSES=$([ "$store_ips" = "y" ] && echo true || echo false)
MAX_MESSAGE_LENGTH=8000
MAX_ATTACHMENT_SIZE_MB=25
MAX_ATTACHMENTS_PER_MESSAGE=5
MESSAGE_EDIT_WINDOW_MINUTES=15

RATE_LIMIT_MESSAGES_PER_MINUTE=20
RATE_LIMIT_REGISTRATIONS_PER_HOUR=10

TURNSTILE_SITE_KEY=$turnstile_site_key
TURNSTILE_SECRET_KEY=$turnstile_secret_key

STORAGE_DRIVER=$storage_driver
S3_ENDPOINT=$s3_endpoint
S3_REGION=$s3_region
S3_BUCKET=$s3_bucket
S3_ACCESS_KEY_ID=$s3_access_key
S3_SECRET_ACCESS_KEY=$s3_secret_key
S3_FORCE_PATH_STYLE=$s3_force_path_style
EOF
  if [ "$use_minio_profile" = "y" ]; then
    {
      echo ""
      echo "MINIO_ROOT_USER=$s3_access_key"
      echo "MINIO_ROOT_PASSWORD=$s3_secret_key"
    } >> .env
  fi
  chmod 600 .env
  info ".env written (permissions restricted to your user)."

  echo
  bold "Starting Termine..."
  if [ "$use_minio_profile" = "y" ]; then
    docker compose --profile minio up -d --build
  else
    docker compose up -d --build
  fi

  echo
  info "Waiting for the app to become healthy..."
  attempts=0
  until curl -sf "http://localhost:$port/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      warn "The app didn't respond within 60s. Check logs with: docker compose logs -f app"
      break
    fi
    sleep 1
  done

  echo
  bold "Termine is up."
  echo "Open $public_url in your browser to finish setting up your admin account."
  echo
  echo "Useful commands:"
  echo "  docker compose logs -f app     # tail application logs"
  echo "  docker compose down            # stop everything"
  echo "  docker compose up -d --build   # rebuild and restart after an update"
  echo
  echo "Your generated PostgreSQL password and session secret are saved in .env -"
  echo "back that file up somewhere safe (e.g. a password manager), it is not in git."
}

main "$@"
