import React, { Component, PropTypes } from 'react';
import { DragDropManager } from 'dnd-core';
import ComponentDragSource from './ComponentDragSource';
import ComponentDropTarget from './ComponentDropTarget';
import ComponentHandlerMap from './ComponentHandlerMap';
import shallowEqual from './utils/shallowEqual';
import shallowEqualScalar from './utils/shallowEqualScalar';
import assign from 'lodash/object/assign';
import invariant from 'invariant';
import validateDecoratorArguments from './utils/validateDecoratorArguments';

const DEFAULT_KEY = '__default__';

function isComponentDragDropHandler(obj) {
  return obj instanceof ComponentDragSource ||
         obj instanceof ComponentDropTarget;
}

export default function configureDragDrop(configure, collect, options = {}) {
  validateDecoratorArguments('configureDragDrop', ...arguments);
  const { arePropsEqual = shallowEqualScalar } = options;

  invariant(
    typeof configure === 'function',
    'configureDragDrop call is missing its first required parameter, ' +
    'a function that registers drag sources and/or drop targets.'
  );
  invariant(
    typeof collect === 'function',
    'configureDragDrop call is missing its second required parameter, ' +
    'a function that collects props to inject into the component.'
  );

  return function (DecoratedComponent) {
    const displayName =
      DecoratedComponent.displayName ||
      DecoratedComponent.name ||
      'Component';

    return class DragDropHandler extends Component {
      static displayName = `${displayName}DragDropHandler`;

      static contextTypes = {
        dragDropManager: PropTypes.object.isRequired
      }

      shouldComponentUpdate(nextProps, nextState) {
        return !arePropsEqual(nextProps, this.props) ||
               !shallowEqual(nextState, this.state);
      }

      constructor(props, context) {
        super(props);
        this.handleChange = this.handleChange.bind(this);
        this.getComponentRef = this.getComponentRef.bind(this);
        this.setComponentRef = this.setComponentRef.bind(this);
        this.componentRef = null;

        this.manager = context.dragDropManager;
        invariant(
          this.manager instanceof DragDropManager,
          'Could not find the drag and drop manager in the context of %s. ' +
          'Make sure to wrap the top-level component of your app with configureDragDropContext. ' +
          'Read more: https://gist.github.com/gaearon/7d6d01748b772fda824e',
          displayName,
          displayName
        );

        const handlers = this.getNextHandlers(props);
        this.handlerMap = new ComponentHandlerMap(this.manager, handlers, this.handleChange);
        this.state = this.getCurrentState();
      }

      setComponentRef(ref) {
        this.componentRef = ref;
      }

      getComponentRef() {
        return this.componentRef;
      }

      componentWillReceiveProps(nextProps) {
        if (!arePropsEqual(nextProps, this.props)) {
          const nextHandlers = this.getNextHandlers(nextProps);
          this.handlerMap.receiveHandlers(nextHandlers);
          this.handleChange();
        }
      }

      componentWillUnmount() {
        const disposable = this.handlerMap.getDisposable();
        disposable.dispose();
      }

      handleChange() {
        const nextState = this.getCurrentState();
        if (!shallowEqual(nextState, this.state)) {
          this.setState(nextState);
        }
      }

      getNextHandlers(props) {
        props = assign({}, props);

        const register = {
          dragSource: (type, spec) => {
            return new ComponentDragSource(type, spec, props, this.getComponentRef);
          },
          dropTarget: (type, spec) => {
            return new ComponentDropTarget(type, spec, props, this.getComponentRef);
          }
        };

        let handlers = configure(register, props);
        if (isComponentDragDropHandler(handlers)) {
          handlers = { [DEFAULT_KEY]: handlers };
        }

        if (process.env.NODE_ENV !== 'production') {
          invariant(
            handlers != null &&
            typeof handlers === 'object' &&
            Object.keys(handlers).every(key =>
              isComponentDragDropHandler(handlers[key])
            ),
            'Expected the first argument to configureDragDrop for %s to ' +
            'either return the result of calling register.dragSource() ' +
            'or register.dropTarget(), or an object containing only such values. ' +
            'Read more: https://gist.github.com/gaearon/9222a74aaf82ad65fd2e',
            displayName
          );
        }

        return handlers;
      }

      getCurrentState() {
        let handlerMonitors = this.handlerMap.getHandlerMonitors();

        if (typeof handlerMonitors[DEFAULT_KEY] !== 'undefined') {
          handlerMonitors = handlerMonitors[DEFAULT_KEY];
        }

        const monitor = this.manager.getMonitor();
        return collect(handlerMonitors, monitor);
      }

      render() {
        return (
          <DecoratedComponent {...this.props}
                              {...this.state}
                              ref={this.setComponentRef} />
        );
      }
    };
  };
}