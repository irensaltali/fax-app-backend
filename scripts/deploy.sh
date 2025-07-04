#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to run tests for a service
run_service_tests() {
  local service_path=$1
  local service_name=$(basename "$service_path")
  
  echo -e "${BLUE}Running tests for service: $service_name${NC}"
  
  # Check if package.json exists
  if [ ! -f "$service_path/package.json" ]; then
    echo -e "${YELLOW}No package.json found in $service_name, skipping tests${NC}"
    return 0
  fi
  
  # Check if test script exists in package.json
  if ! grep -q '"test"' "$service_path/package.json"; then
    echo -e "${YELLOW}No test script found in $service_name package.json, skipping tests${NC}"
    return 0
  fi
  
  # Run tests
  (cd "$service_path" && npm test -- --run)
  local test_exit_code=$?
  
  if [ $test_exit_code -eq 0 ]; then
    echo -e "${GREEN}✓ Tests passed for $service_name${NC}"
    return 0
  else
    echo -e "${RED}✗ Tests failed for $service_name${NC}"
    return 1
  fi
}

# Function to run all tests
run_all_tests() {
  local failed_tests=()
  local passed_tests=()
  
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}Running tests for all services...${NC}"
  echo -e "${BLUE}===========================================${NC}"
  
  # Test all services
  for service in ./services/*; do
    if [ -d "$service" ]; then
      if run_service_tests "$service"; then
        passed_tests+=($(basename "$service"))
      else
        failed_tests+=($(basename "$service"))
      fi
    fi
  done
  
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}Test Results Summary:${NC}"
  echo -e "${BLUE}===========================================${NC}"
  
  if [ ${#passed_tests[@]} -gt 0 ]; then
    echo -e "${GREEN}Passed tests:${NC}"
    for service in "${passed_tests[@]}"; do
      echo -e "${GREEN}  ✓ $service${NC}"
    done
  fi
  
  if [ ${#failed_tests[@]} -gt 0 ]; then
    echo -e "${RED}Failed tests:${NC}"
    for service in "${failed_tests[@]}"; do
      echo -e "${RED}  ✗ $service${NC}"
    done
    echo -e "${RED}===========================================${NC}"
    echo -e "${RED}Deployment aborted due to test failures!${NC}"
    echo -e "${RED}Please fix the failing tests before deploying.${NC}"
    echo -e "${RED}===========================================${NC}"
    return 1
  fi
  
  echo -e "${GREEN}===========================================${NC}"
  echo -e "${GREEN}All tests passed! Proceeding with deployment...${NC}"
  echo -e "${GREEN}===========================================${NC}"
  return 0
}

# Function to deploy a worker
deploy_worker() {
  local config_path=$1
  local api_config=$2
  local env=$3

  echo -e "${BLUE}Deploying worker with config path: $config_path and API config: $api_config${NC}"
  echo -e "${BLUE}Environment: $env${NC}"
  
  if [ -z "$env" ]; then
    wrangler kv key put api-config.json --path $api_config --binding CONFIG --config $config_path --preview false
    wrangler kv key put DISPOSABLE_DOMAINS --path ./data/disposable.txt --binding CONFIG --config $config_path --preview false 
    wrangler deploy --config $config_path
  else
    wrangler kv key put api-config.json --path $api_config --binding CONFIG --config $config_path --preview false --env $env
    wrangler kv key put DISPOSABLE_DOMAINS --path ./data/disposable.txt --binding CONFIG --config $config_path --preview false --env $env
    wrangler deploy --config $config_path --env $env
  fi
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Main worker deployed successfully${NC}"
  else
    echo -e "${RED}✗ Main worker deployment failed${NC}"
    return 1
  fi
}

# Function to deploy a service
deploy_service() {
  local service_path=$1
  local env=$2
  local service_name=$(basename "$service_path")
  
  echo -e "${BLUE}Deploying service: $service_name${NC}"
  
  if [ -z "$env" ]; then
    (cd "$service_path" && wrangler deploy)
  else
    (cd "$service_path" && wrangler deploy --env "$env")
  fi
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Service $service_name deployed successfully${NC}"
  else
    echo -e "${RED}✗ Service $service_name deployment failed${NC}"
    return 1
  fi
}

# Check if at least one argument is provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <project> <all> [--env <environment>] [--skip-tests]"
  echo "  <project>: The project name (used for config files)"
  echo "  <all>: Deploy all services in addition to main worker"
  echo "  --env <environment>: Deploy to specific environment"
  echo "  --skip-tests: Skip running tests before deployment"
  exit 1
fi

# Set project and config paths
PROJECT=$1
CONFIG_PATH="wrangler.$PROJECT.toml"
API_CONFIG="api-config.$PROJECT.json"
ENV=""
SKIP_TESTS=false

# Parse arguments
shift
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    all)
      DEPLOY_ALL=true
      shift
      ;;
    *)
      if [ "$1" == "all" ]; then
        DEPLOY_ALL=true
      fi
      shift
      ;;
  esac
done

# Print received parameters and defaults
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}Deployment Configuration:${NC}"
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}Project: $PROJECT${NC}"
echo -e "${BLUE}Config Path: $CONFIG_PATH${NC}"
echo -e "${BLUE}API Config: $API_CONFIG${NC}"
echo -e "${BLUE}Environment: ${ENV:-default}${NC}"
echo -e "${BLUE}Deploy All Services: ${DEPLOY_ALL:-false}${NC}"
echo -e "${BLUE}Skip Tests: $SKIP_TESTS${NC}"
echo -e "${BLUE}===========================================${NC}"

# Run tests first (unless skipped)
if [ "$SKIP_TESTS" = false ]; then
  if ! run_all_tests; then
    exit 1
  fi
else
  echo -e "${YELLOW}Skipping tests as requested...${NC}"
fi

# Deploy the main worker
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}Starting deployment process...${NC}"
echo -e "${BLUE}===========================================${NC}"

if ! deploy_worker $CONFIG_PATH $API_CONFIG $ENV; then
  echo -e "${RED}Main worker deployment failed, aborting...${NC}"
  exit 1
fi

# Check if the 'all' flag is provided
if [ "$DEPLOY_ALL" = true ]; then
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}Deploying all services...${NC}"
  echo -e "${BLUE}===========================================${NC}"
  
  failed_deployments=()
  successful_deployments=()
  
  for service in ./services/*; do
    if [ -d "$service" ]; then
        # Check if the required .toml file exists
        TOML_FILE="$service/wrangler.toml"
        if [ -f "$TOML_FILE" ]; then
            if deploy_service "$service" "$ENV"; then
              successful_deployments+=($(basename "$service"))
            else
              failed_deployments+=($(basename "$service"))
            fi
        else
            echo -e "${YELLOW}Skipping $(basename "$service"): wrangler.toml not found.${NC}"
        fi
    fi
  done
  
  # Summary
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}Deployment Summary:${NC}"
  echo -e "${BLUE}===========================================${NC}"
  
  if [ ${#successful_deployments[@]} -gt 0 ]; then
    echo -e "${GREEN}Successfully deployed services:${NC}"
    for service in "${successful_deployments[@]}"; do
      echo -e "${GREEN}  ✓ $service${NC}"
    done
  fi
  
  if [ ${#failed_deployments[@]} -gt 0 ]; then
    echo -e "${RED}Failed to deploy services:${NC}"
    for service in "${failed_deployments[@]}"; do
      echo -e "${RED}  ✗ $service${NC}"
    done
    echo -e "${RED}Some deployments failed!${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}🎉 All deployments completed successfully!${NC}"
echo -e "${GREEN}===========================================${NC}"

