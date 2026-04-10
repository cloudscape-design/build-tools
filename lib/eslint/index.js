// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import banFiles from "./ban-files.js";
import rscDirective from "./react-server-components-directive.js";

export default {
  rules: {
    "ban-files": banFiles,
    "react-server-components-directive": rscDirective,
  },
};
