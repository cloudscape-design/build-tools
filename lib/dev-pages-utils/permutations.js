// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import flatten from "lodash/flatten.js";
export function createPermutations(permutations) {
    return flatten(permutations.map(set => doCreatePermutations(set)));
}
function doCreatePermutations(permutations) {
    const result = [];
    const propertyNames = Object.keys(permutations);
    function addPermutations(remainingPropertyNames, currentPropertyValues) {
        if (remainingPropertyNames.length === 0) {
            result.push({ ...currentPropertyValues });
            return;
        }
        const propertyName = remainingPropertyNames[0];
        permutations[propertyName].forEach(propertyValue => {
            currentPropertyValues[propertyName] = propertyValue;
            addPermutations(remainingPropertyNames.slice(1), currentPropertyValues);
        });
    }
    addPermutations(propertyNames, {});
    return result;
}
