// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import badFiles from "./ban-files.js";
import rscDirective from "./react-server-components-directive.js";

export default {
  rules: {
    "ban-files": badFiles,
    "react-server-components-directive": rscDirective,
  },
};
