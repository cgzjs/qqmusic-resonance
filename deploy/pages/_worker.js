const pagesGateway = {
  fetch(request, env) {
    return env.APP.fetch(request);
  },
};

export default pagesGateway;
