#!/bin/bash

# Function to deploy a worker
deploy_worker() {
  local config_path=$1
  local api_config=$2
  local env=$3

  echo "Deploying worker with config path: $config_path and API config: $api_config"
  echo "Environment: $env"
  if [ -z "$env" ]; then
    wrangler kv key put api-config.json --path $api_config --binding CONFIG --config $config_path --preview false
    wrangler kv key put DISPOSABLE_DOMAINS --path ./data/disposable.txt --binding CONFIG --config $config_path --preview false 
    wrangler deploy --config $config_path
  else
    wrangler kv key put api-config.json --path $api_config --binding CONFIG --config $config_path --preview false --env $env
    wrangler kv key put DISPOSABLE_DOMAINS --path ./data/disposable.txt --binding CONFIG --config $config_path --preview false --env $env
    wrangler deploy --config $config_path --env $env
  fi
}

# Check if at least one argument is provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <project> <all> [-env <environment>]"
  exit 1
fi

# Set project and config paths
PROJECT=$1
CONFIG_PATH="wrangler.$PROJECT.toml"
API_CONFIG="api-config.$PROJECT.json"
ENV=""

# Check for optional environment flag
if [ "$3" == "--env" ] && [ -n "$4" ]; then
  ENV=$4
fi

# Print received parameters and defaults
echo "Project: $PROJECT"
echo "Config Path: $CONFIG_PATH"
echo "API Config: $API_CONFIG"
echo "Environment: $ENV"

# Deploy the main worker
deploy_worker $CONFIG_PATH $API_CONFIG $ENV

# Check if the 'all' flag is provided
if [ "$2" == "all" ]; then
  for service in ./services/*; do
    if [ -d "$service" ]; then
        # Check if the required .toml file exists
        TOML_FILE="$service/wrangler.toml"
        if [ -f "$TOML_FILE" ]; then
            echo "Deploying service: $service"
            if [ -z "$ENV" ]; then
                (cd "$service" && wrangler deploy)
            else
                (cd "$service" && wrangler deploy --env "$ENV")
            fi
        else
            echo "Skipping $service: wrangler.toml not found."
        fi
    fi
  done
fi
